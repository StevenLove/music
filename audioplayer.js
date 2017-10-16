var Formants = require('./formants.js');

var AudioPlayer = (function(){
    
    // Parameters
    const fullVolume = 0.5;
    const defaultVolume = 0.1;
    var currentVolume = defaultVolume;

    var audioCtx;
    var gainNode;
    var analyserNode;
    var analyserBuffer;

    var noiseBuffer;
    var waveTables;
    var currentWaveTable;

    var biquads;
    var distortionCurve;




    const init = () => {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if(!audioCtx){
            throw "AudioPlayer Error: your browser doesn't support web audio";
        }
        const sampleRate = audioCtx.sampleRate;

        // WHITE NOISE GENERATION
        var bufferSize = 2 * sampleRate;
        var lastOut = 0.0;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
        var output = noiseBuffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            var white = Math.random() * 2 - 1;
            // output[i] = (lastOut + (0.02 * white)) / 1.02;
            // lastOut = output[i];
            // output[i] *= 3.5; // (roughly) compensate for gain
            output[i] = white;
        }

        waveTables = WaveTables(audioCtx);

        
        /* formants */
        biquads = [0,0,0];
        biquads = biquads.map(x=>audioCtx.createBiquadFilter())
        biquads.forEach(filter=>{
            filter.type="bandpass"; //bandpass to reduce freqs outside this range. peaking for emphasis
            filter.gain.value = 25;
            filter.Q.value = 10;
        })
        biquads[0].frequency.value = 520;
        biquads[1].frequency.value = 1190;
        biquads[2].frequency.value = 2390;
        
        biquads[0].connect(biquads[1]);
        biquads[1].connect(biquads[2]);

        const biquadGain = audioCtx.createGain();



        // SOURCE NODES
        gainNode = audioCtx.createGain();
        analyserNode = audioCtx.createAnalyser();

        // DESTINATION
        const computerSpeakers = audioCtx.destination;
                
        // SET NODE PROPERTIES
        gainNode.gain.value = defaultVolume;
        analyserNode.fftSize = 256;
        var bufferLength = analyserNode.frequencyBinCount;
        console.log("analyser buffer length",bufferLength);
        analyserBuffer = new Uint8Array(bufferLength);



        // CONNECT NODE
        gainNode.connect(analyserNode);
        analyserNode.connect(computerSpeakers);
        biquads[2].connect(biquadGain);
        biquadGain.gain.value = 1000;
        biquadGain.connect(gainNode);

        // START
        unmute();
    }

    const setVowel = v => {
        const freqs = Formants.peaksForVowelSound(v);
        for(var i=0; i < 3; ++i){
            biquads[i].frequency.value = freqs[i];
        }
    }


    const playingNotes = {};
    var amplitudes = [0,1];
    
    const playNote2 = (note,parentID) => {
        if(playingNotes[parentID])return;
        const f = note.frequency; //fundamental

        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        g.gain.value = 0;

        o.setPeriodicWave(currentWaveTable);
        o.frequency.value = f;
        // o.connect(g);
        // g.connect(gainNode);
        var distortion = Distortion.getCurve();
        if(distortion){
            const distortionNode = audioCtx.createWaveShaper();
            distortionNode.curve = distortion;
            o.connect(distortionNode);
            distortionNode.connect(g);
        }
        else{
            o.connect(g);
        }

        /* formants */
        // var white = createNoiseNode();
        // white.connect(biquads[0]);
        // white.start();
        // white.stop(audioCtx.currentTime + 0.1);
        g.connect(biquads[0]);
        biquads[2].connect(gainNode);
        // g.connect(gainNode);
        
        
        var normalGain;
        if(note.amplitude != undefined){
            normalGain = note.amplitude;
        }
        else{
            normalGain = 1;
        }
        g.gain.linearRampToValueAtTime(normalGain,audioCtx.currentTime + 0.01);

        o.start();
        playingNotes[parentID] = {o:o,g:g}
    }

    const createNoiseNode = () => {
        var noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        return noiseNode;
    }
    const playAttack = () => {
        const attackTime = 0.1;//seconds
        var noiseNode = createNoiseNode();
        var attackGain = audioCtx.createGain();
        attackGain.gain.value = currentVolume*2;
        attackGain.gain.linearRampToValueAtTime(0,audioCtx.currentTime + attackTime);
        
        noiseNode.connect(attackGain);
        attackGain.connect(gainNode);

        noiseNode.start(0);
        noiseNode.stop(audioCtx.currentTime + attackTime);//seconds
    }
    const stopNote2 = id => {
        var gainNode = playingNotes[id].g;
        // playingNotes[id].g.gain.exponentialRampToValueAtTime(0.1,audioCtx.currentTime + 0.5);
        // gainNode.gain.linearRampToValueAtTime(0.01,audioCtx.currentTime + 1.2);
        playingNotes[id].o.stop(audioCtx.currentTime + 0.5)  ;
        gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
        delete playingNotes[id];
    }

    const playBuffer = buffer => {
        var myArrayBuffer = audioCtx.createBuffer(1, 1024, audioCtx.sampleRate);
        myArrayBuffer.copyToChannel(buffer,0);

        var source = audioCtx.createBufferSource();
        source.buffer = myArrayBuffer;
        source.connect(gainNode);
        source.loop = true;
        source.start();
        source.stop(audioCtx.currentTime + 2);

    }


    const mute = () => {
        gainNode.gain.value = 0.0;
    }
    const unmute = () => {
        gainNode.gain.value = currentVolume;
    }
    const setVolume = volume => {
        currentVolume = volume/100 * fullVolume;
        gainNode.gain.value = currentVolume;
    }

    const randomizeAmplitudes = () => {
        amplitudes = new Array(6).fill("").map(a=>{
            return Math.random();
        })
    }
    const setAmplitude = (index,amount) => {
        amplitudes[index] = amount;
    }
    const setWaveTable = name => {
        if(name == "custom"){
            currentWaveTable = waveTables.custom(amplitudes);
        }
        else{
            currentWaveTable = waveTables[name];
        }
    }

    const getByteFrequencyData = () => {
        analyserNode.getByteFrequencyData(analyserBuffer);
        return analyserBuffer;
    }

    init();
    return({
        mute:mute,
        unmute:unmute,
        setVolume:setVolume,
        playNote:playNote2,
        stopNote:stopNote2,
        playAttack:playAttack,
        randomizeAmplitudes:randomizeAmplitudes,
        setWaveTable:setWaveTable,
        setAmplitude:setAmplitude,
        setVowel:setVowel,
        playBuffer:playBuffer,
        getByteFrequencyData:getByteFrequencyData
        
    })
    

})()

module.exports = AudioPlayer;

