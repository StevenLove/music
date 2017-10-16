(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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


},{"./formants.js":10}],2:[function(require,module,exports){
const Constants = (()=>{
    return({
        JNDCents: 15, //just noticeable difference in cents
    })
})()
},{}],3:[function(require,module,exports){
var teoria = require("teoria");

const Converter = (()=>{
    const SCALE_DEGREE_NAMES = {
        0:"root",
        1:"minor 2nd",
        2:"major 2nd",
        3:"minor 3rd",
        4:"major 3rd",
        5:"perfect 4th",
        6:"tritone",
        7:"perfect 5th",
        8:"minor 6th",
        9:"major 6th",
        10:"minor 7th",
        11:"major 7th",
        12:"octave"
    }

    const intervalToName = semitones => {
        if(semitones < 0 || semitones > 12){
            console.error("too many intervals");
            return "unnamed";
        }
        return SCALE_DEGREE_NAMES[semitones];
    }

    const centsToName = cents => {
        var rounded = 100*z.round(cents/100);
        var name = SCALE_DEGREE_NAMES[rounded/100];
        var modifier = (cents >= rounded)? "+" : "-";
        var diff = MATH.abs(cents-rounded).toFixed(0);
        return name+" ("+modifier+diff+")"
    }
    
    // should be between 1 and 2
    const fractionToCents = fraction => {
        if(fraction < 1 || fraction > 2){
            throw "fraction should be between 1 and 2";
        }
        const val = Math.log2(fraction)*1200;
        // console.log("fraction",fraction,"goes to",val);
        return val;
    }
    const centsToFraction = cents => {
        // ratio=10.^((log10(2)/1200)*cents);
        const val = Math.pow(10,(Math.log10(2)/1200)*cents);
        console.log("cents to fraction",cents,val);
        return val;
    }

    const normalizeBetweenOneAndTwo = number => {
        if(number <= 0){
            console.error("number should be positive");
            return;
        }
        while(number >= 2){
            number /= 2;
        }
        while(number < 1){
            number *= 2;
        }
        return number;
    }

    const isInteger = n => n == Math.round(n);
    const harmonicSeriesToCentsAboveRoot = seriesNumber => {
        if(!isInteger(seriesNumber) || seriesNumber < 1){
            console.error("incorrect input to harmonic series to cents above root function");
            return;
        }
        // divide by 2 until its between one and two
        const fraction = normalizeBetweenOneAndTwo(seriesNumber);
        // console.log("fraction",fraction);
        return fractionToCents(fraction);

    }
    
    const frequencyToCents = (root,target) => {
        const fraction = target / root;
        return fractionToCents(fraction);
    }

    const differenceInCents = (note1, note2) => {
        const f1 = note1.freq();
        const f2 = note2.freq();
        const ratio = f1/f2;
        var multiplier = 1;
        if(ratio < 1){
            ratio = 1/ratio;
            multiplier = -1;
        }
        const octaves = Math.floor(Math.log2(ratio));
        const remainder = ratio-Math.pow(octaves,2);
        const cents = 1200 * octaves + fractionToCents(ratio);
        return multiplier * cents;
    }

    const withinJND = (note1, note2) => {
        return Math.abs(differenceInCents(note1,note2)) < Constants.JNDCents;
    }
    const withinJNDCrossOctave = (note1, note2) => {
        const absDiff = Math.abs(differenceInCents(note1,note2));
        const diffWithoutOctave = absDiff % 1200;
        return diffWithoutOctave < Constants.JNDCents;
    }
    const intervalToIntervalClass = interval => {
        const input = interval.toString();
        interval = interval.simple();
        while(interval.smaller(teoria.interval('P1'))){
            interval = interval.add(teoria.interval('P8'));
        }
        const intervalClass = interval.semitones();
        console.log(input,"is interval class",intervalClass);
        return intervalClass;
    }

    const semitonesToSimpleName = semitones => {
        const names = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7']
        return names[semitones];    
    }
    const simpleNameToSemitones = scaleDegreeName => {
        const names = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7']
        const index = names.indexOf(scaleDegreeName);
        if(index < 0){
            throw "scale degree with bad name " + scaleDegreeName;
        }
        return index;
    }

    const incrementIntervalClass = semitones => {
        return (semitones + 1) % 12;
    }

    /*
    const harmonicFromRoot = (root, note) => {
        const f1 = root.freq();
        const f2 = note.freq();
        for(var i = 1; i < 30; ++i){
            var f = i * f1;
            
        }
    }
    */
    const frequencyToName = f => {
        const obj = teoria.note.fromFrequency(f);
        const offset = Math.round(obj.cents);
        var suffix = "";
        if(offset != 0){
            suffix = " ("+offset+")";
        }
        return obj.note.toString() + suffix;
    }

    const myMod = (v,modulo) => {
        while(v<0){
            v+=modulo;
        }
        return v%modulo;
    }

    return ({
        intervalToName:intervalToName,
        centsToName:centsToName,
        centsToFraction:centsToFraction,
        fractionToCents:fractionToCents,
        frequencyToCents:frequencyToCents,
        normalizeBetweenOneAndTwo:normalizeBetweenOneAndTwo,
        intervalToIntervalClass:intervalToIntervalClass,
        simpleNameToSemitones:simpleNameToSemitones,
        semitonesToSimpleName:semitonesToSimpleName,
        incrementIntervalClass:incrementIntervalClass,
        harmonicSeriesToCentsAboveRoot:harmonicSeriesToCentsAboveRoot,
        frequencyToName:frequencyToName,
        myMod:myMod
        // harmonicFromRoot:harmonicFromRoot
    })
})()

module.exports = Converter;
},{"teoria":36}],4:[function(require,module,exports){
const d3plotter = (spectrum=>{

    var sData = spectrum.getAll();
        
    var margin = {top: 20, right: 20, bottom: 30, left: 50},
        width = 400 - margin.left - margin.right,
        height = 100 - margin.top - margin.bottom;


    var x = d3.scaleLinear()
        .range([0, width])

    var y = d3.scaleLinear()
        .range([height, 0]);

    

    // var xAxis = d3.svg.axis()
    //     .scale(x)
    //     .orient("bottom");

    // var yAxis = d3.svg.axis()
    //     .scale(y)
    //     .orient("left");

    var line = d3.line()
        .x(function(d) { return x(d.x); })
        .y(function(d) { return y(d.y); });

    var svg = d3.select("body").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    
    const parseData = dataToParse => {
        return dataToParse.map(function(d,i) {
            return {
                x:i,
                y:d
            };
            
        });
    }

    var data = parseData(sData);

    console.log("initial data",data);


    x.domain(d3.extent(data, function(d) { return d.x; }));
    y.domain(d3.extent(data, function(d) { return d.y; }));


    /* Add x Axis */
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    /* text label for x Axis */
    svg.append("text")
        .attr("transform",
            "translate(" + (width/2) + " ," + 
                            (height + margin.top + 20) + ")")
        .style("text-anchor", "middle")
        .text("Frequency");

    // Add the y Axis
    svg.append("g")
        .call(d3.axisLeft(y));

    // text label for the y axis
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x",0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Amount"); 
    // svg.append("g")
    //     .attr("class", "x axis")
    //     .attr("transform", "translate(0," + height + ")")
    //     .call(xAxis);

    // svg.append("g")
    //     .attr("class", "y axis")
    //     .call(yAxis)
    //     .append("text")
    //     .attr("transform", "rotate(-90)")
    //     .attr("y", 6)
    //     .attr("dy", ".71em")
    //     .style("text-anchor", "end")
    //     .text("Amplitude");

    svg.append("path")
        .datum(data)
        .attr("class", "line")
        .attr("d", line);

    const updateWithSpectrum = spectrum => {
        var data = parseData(spectrum.getAll());


        // Scale the range of the data again 
        x.domain(d3.extent(data, function(d) { return d.x; }));
        y.domain([0, d3.max(data, function(d) { return d.y; })]);

        svg.select(".line")
            .attr("d",line(data))

        svg.select(".x.axis") // change the x axis
            .call(xAxis);
        svg.select(".y.axis") // change the y axis
            .call(yAxis);

    }
    return ({
        update:updateWithSpectrum
    })
});
},{}],5:[function(require,module,exports){
const Distortion = (()=>{
    const width = 300;
    const height = 300;
    
    const drawable = DrawableArray("distortion",width,height);
    $(document).ready(()=>{
        $("#distortion").append(drawable.getElement());
    })

    return ({
        getCurve:drawable.getArray
    })
})()

},{}],6:[function(require,module,exports){
const DrawableArray = ((id,width,height) =>{
    
    const $container = $("<div id='"+id+"Container'>");
    const $canvas = $("<canvas id='"+id+"Canvas' width='"+width+"' height='"+height+"'></canvas>")
    .css(
        {"border-color": "#000000", 
        "border-width":"1px", 
        "border-style":"solid"}
    );
    const canvas = $canvas[0];
    const checkboxID = id+"Checkbox";
    const $checkbox = $("<input type='checkbox' id='"+checkboxID+"'>");
    
    const onChangeFunctions = [];


    var enabled = false;

    var drawnWave;
    
    const setArray = arr => {
        drawnWave.setCurve(arr);
    }
    

    const setup = () => {
        drawnWave = DrawnWave(canvas);
        drawnWave.setup();
        const updateEnabledness = () => {
            if($checkbox.prop("checked")){
                enabled = true;
            }
            else{
                enabled = false;
            }
        }
        $checkbox.on("change",updateEnabledness);
        updateEnabledness();
        $container.append($checkbox).append($canvas);
        drawnWave.onChange(notifyChange);
    }

    const getArray = () => {
        if(enabled)return drawnWave.getCurve();
    }

    const getElement = () => {
        return $container
    }
    const onChange = f => {
        onChangeFunctions.push(f);
    }
    const notifyChange = () => {
        onChangeFunctions.forEach(f=>f());
    }

    $(document).ready(setup);

    
    return({
       getArray:getArray,
       setArray:setArray,
       getElement: getElement,
       onChange:onChange,
       setup:setup
    });
    
})
},{}],7:[function(require,module,exports){
const DrawnWave = (canvas=>{

    var width = canvas.width;
    var height = canvas.height;
    var ctx;
    var graphedFunction = new Float32Array(width);

    /* Helper functions to get x and y offset where we interact with a canvas */
    function getMousePos(canvas, evt) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: Math.floor(evt.clientX - rect.left),
            y: Math.floor(evt.clientY - rect.top)
        };
    }
    function getTouchPos(canvasDom, touchEvent) {
        var rect = canvasDom.getBoundingClientRect();
        return {
            x: Math.floor(touchEvent.touches[0].clientX - rect.left),
            y: Math.floor(touchEvent.touches[0].clientY - rect.top)
        };
    }

    const getCurve = () => {
        return graphedFunction;
    }
    const setCurve = arr => {
        graphedFunction = arr;
        ctx.fillStyle="white";
        ctx.fillRect(0,0,width,height);
        notifyChange();
    }
    const onChangeFunctions = [];        
    const onChange = f => {
        onChangeFunctions.push(f);
    }
    const notifyChange = () => {
        onChangeFunctions.forEach(f=>f());
    }

    const setup = () => {
        /* initialize canvas */
        ctx = canvas.getContext('2d');

        /* initialize graph */
        for(var i = 0; i < width; ++i){
            graphedFunction[i] = i/width;
        }

        /* defaults */
        var tracking = false;
        var lastX;
        var lastY;

        const drawFunction = () => {
            graphedFunction.forEach((y,index)=>{
                const graphableY = -((y*height)-height)
                ctx.fillStyle="red";
                ctx.fillRect(index,graphableY,1,1);
            })
        }


        const handleStart = () => {
            tracking = true;
            lastX = undefined;
            $(window).one('mouseup touchend',handleEnd);
            watchMoves();
        }
        const handleEnd = () => {
            tracking = false;
            drawFunction();
            notifyChange();
        }
        const watchMoves = () => {
            const handleMove = (x,y) => {
                if(tracking){
                    if(!lastX) lastX = x;
                    if(!lastY) lastY = y;
                    var minX = Math.min(lastX,x)
                    var maxX = Math.max(lastX,x);
                    ctx.fillStyle = "white";
                    ctx.fillRect(minX,0,maxX-minX,height);
                    ctx.fillStyle = "black";
                    // ctx.fillRect(minX,y,maxX-minX,1);
                    var delta = x >= lastX ? 1 : -1;
                    var rise = y-lastY;
                    var run = x-lastX;
                    var slope = rise/run;
                    if(run >= 0){
                        for(var i = lastX; i < x; ++i){
                            var tempY = Math.floor(lastY + slope*(i-lastX));
                            ctx.fillRect(i,tempY,1,1);
                            graphedFunction[i] = (height-tempY)/height;
                        }
                    }
                    else{
                        for(var i = lastX; i > x; --i){
                            var tempY = Math.floor(lastY + slope*(i-lastX));
                            ctx.fillRect(i,tempY,1,1);
                            graphedFunction[i] = (height-tempY)/height;
                        }
                    }
                    
                    lastX = x;
                    lastY = y;
                }
            }
            /* handle mouse move events */
            $(canvas).on("mousemove",moveEvent => {
                var pos = getMousePos(canvas, moveEvent);
                handleMove(pos.x,pos.y);
                moveEvent.preventDefault();
            });
            /* handle touch gesture events */
            $(canvas).on("touchmove",touchEvent => {
                var pos = getTouchPos(canvas,touchEvent);
                handleMove(pos.x,pos.y);
                touchEvent.preventDefault();
            })
        }
        drawFunction();
        
        $(canvas).on('mousedown touchstart',handleStart);
    }
    return ({
        setup:setup,
        onChange:onChange,
        getCurve:getCurve,
        setCurve:setCurve
    })
});

},{}],8:[function(require,module,exports){
// store a spectrum from 20hz to 20000hz
// 2 to 2000
// 2^1 to 2^ 11

// const ear = (() => {
//     const MIN_FREQ = 20; //hz (inclusive)
//     const MAX_FREQ = 20000; //hz (exclusive)
//     const samplesPerOctave = 50;
//     const audibleOctaves = 10;
//     const totalSamples = samplesPerOctave * audibleOctaves;

//     const idealHarmonicSeriesWithRoot = f => {
//         if(isAudibleFrequency(f)){
//             const spectrum = new Array(totalSamples);
//             var harmonic = 1;
//             var amplitude = 1;       
//             while(f < MAX_FREQ){
//                 spectrum[indexFromFrequency(f*harmonic)] = Math.pow(0.88,harmonic-1) * amplitude;
//             }
//         }
//     }

// })()

// ear.prototype.isAudibleFrequency = f => f < MAX_FREQ && f >= MIN_FREQ;
// ear.prototype.isAudibleIndex = i => i < totalSamples && i >= 0;
// ear.prototype.indexFromFrequency = f => {
//     if(isAudibleFrequency(f)){
//         return Math.floor((f - 20) / 40);
//     }
//     throw "invalid frequency " + f;
// }
// ear.prototype.frequencyFromIndex = index => {
//     if(isAudibleIndex(index)){
//         return index * 40 + 20;
//     }
//     throw "invalid index " + index;
// }
},{}],9:[function(require,module,exports){

const MAJOR_SCALE = [
    0,200,400,500,700,900,1100,1200
]


const createBulge = () => {
    var bulge = spectrum();
    var halfwidth = 100;
    for(var i = -halfwidth; i < halfwidth; ++i){
        var dist = (halfwidth-Math.abs(i))/halfwidth;
        var amt;
            amt = Math.pow(dist,4);
            // amt = dist
        bulge.set(i,amt)
    }
    return bulge;
}

const createHarmonicSeries = () => {
    var iterations = 16;

    var harmonicSeries = spectrum();
    for(var i = 1; i <= iterations; ++ i){
        var c = Converter.harmonicSeriesToCentsAboveRoot(i);
        var thisBulge = createBulge().shiftUp(c);
        // thisBulge.scale(1/i);
        harmonicSeries = harmonicSeries.add(thisBulge);
    }
    return harmonicSeries;
}
const createTone = cents => {
    return createHarmonicSeries().shiftUp(cents);
}
const createChord = centsArr => {
    var chord = spectrum();
    centsArr.forEach(cents=>{
        chord = chord.add(createTone(cents));
    })
    return chord;
}

const plotGraphs = () => {
    var hSeries = createHarmonicSeries();
    hSeries.plot("a","harmonic series");

    var chord = createChord([0,400,700]);
    chord.plot("b","Major chord");

    var combo = chord.times(hSeries);
    combo.plot("c","added");

    var chord_possibilities = spectrum();
    for(var i = 0; i < 1200; ++i){
        var amp = hSeries.times(chord.shiftUp(i)).totalAmplitude();
        chord_possibilities.set(i,amp);
    }
    chord_possibilities.plot("d","likely roots");
}

/* The first spectrum stays still
   The second spectrum is shifted across all values.
   For each amount of shifting, we measure the total area under the combined spectra */
const combinedAmplitudes = (s1,s2) => {
    const result = spectrum();
    for(var i = 0 ; i < 1200; ++i){
        result.set(i,s1.times(s2.shiftUp(i)).totalAmplitude());
    }
    return result;
}
const scaleDegreeToChord = degree => {
    if(degree < 1 || degree > 7){
        console.error("only scale degrees 1-7");
        return;
    }
    const root = majorScaleDegreeToCents(degree);
    var chord;
    switch(degree){
        case 1: case 4: case 5:
            chord = createMajorChord(root);break;
        case 2: case 3: case 6:
            chord = createMinorChord(root);break;
        case 7:
            chord = createDiminishedChord(root);break;
    }
    return chord;  
}
const scaleDegreeToCents = (scale,degree) => {
    return scale[degree-1];
}
const majorScaleDegreeToCents = degree => {
    if(degree < 1 || degree > 7){
        console.error("only scale degrees 1-7");
        return;
    }
    return MAJOR_SCALE[degree-1];
}
const createMajorChord = root => {
    return createChord([root,root+400,root+700]);
}
const createMinorChord = root => {
    return createChord([root,root+300,root+700]);
}
const createDiminishedChord = root => {
    return createChord([root,root+300,root+600]);
}

const plotD3Graphs = () => {
    var chord = createChord([0,300,700]);
    var shiftedChord;
    const hSeries = createHarmonicSeries();
    /*
    var p1 = d3plotter(hSeries);
    var p2 = d3plotter(chord);
    var p3 = d3plotter(hSeries.times(chord));
    var p4 = d3plotter(combinedAmplitudes(hSeries,chord));
    */

    
    /*
    var progression = [1,4,5].map(sd=>scaleDegreeToChord(sd));
    var progression = spectrum();
    [1,4,5].forEach(sd=>{
        var chord = scaleDegreeToChord(sd);
        d3plotter(chord);
        progression = progression.add(chord);
    })
    d3plotter(progression);
    d3plotter(combinedAmplitudes(hSeries,progression));
    */
    // var fourth = createChord([0,500]);
    var root = createTone(0);
    var fourth = createTone(500);
    d3plotter(root);
    d3plotter(fourth);
    
    d3plotter(combinedAmplitudes(fourth,hSeries));
    

    const enableSlider = () => {
        const onSlide = () => {
            const newValue = $("#slider").val();
            shiftedChord = chord.shiftUp(newValue);
            p2.update(shiftedChord);
            p3.update(hSeries.times(shiftedChord));
        }
        $("#slider").on("input",onSlide);
    }

    enableSlider();
}

},{}],10:[function(require,module,exports){



const Formants = (()=>{
    
    

    const peaksForVowelSound = v => {
        const vowels = {
            oo:[300,870,2240],
            ow:[570,840,2410],
            u:[440,1020,2240],
            a:[730,1090,2440],            
            uh:[520,1190,2390],
            er:[490,1350,1690],
            ae:[660,1720,2410],
            e:[530,1840,2480],
            i:[390,1990,2550],
            iy:[270,2290,3010],
            m:[200,2200,3600]
        }
        return vowels[v];
        
    }

    return ({
        peaksForVowelSound:peaksForVowelSound
    })
})()

module.exports = Formants;
},{}],11:[function(require,module,exports){
const AudioPlayer = require("./audioplayer.js");
var shortTimeFT = require("stft");

const Fourier = (()=>{

    const width = 1024;
    const height = 300;

    const visualizer = () => {
        const WIDTH = 400;
        const HEIGHT = 200;
        const $canvas = $("<canvas>").attr("width",WIDTH).attr("height",HEIGHT);
        const canvas = $canvas[0];
        const ctx = canvas.getContext('2d');
        var dataArray;
        ctx.fillStyle = "black";
        ctx.clearRect(0,0,WIDTH,HEIGHT);
        const draw = () => {
            requestAnimationFrame(draw);
            dataArray = AudioPlayer.getByteFrequencyData();
            ctx.fillStyle = "black";
            ctx.fillRect(0,0,WIDTH,HEIGHT);
            var barWidth = (WIDTH / dataArray.length) * 2.5;
            var barHeight;
            var x = 0;
            for(var i = 0; i < dataArray.length; ++i){
                barHeight = dataArray[i]/2;
                ctx.fillStyle = 'rgb('+(barHeight+100) + ',50,50)';
                ctx.fillRect(x,HEIGHT-barHeight/2, barWidth,barHeight);
                x += barWidth + 1;
            }
            // console.log(dataArray);
        }
        draw();
        return $canvas;
    }




    function onTime(v){
        console.log("audio player",AudioPlayer);
        console.log("out frame:",v);
        drawnResult.setArray(v);
        AudioPlayer.playBuffer(v);
    }
    function onFreq(re,im){
        console.log(re,im);
        drawnResult.setArray(re.map(i=>0.5+i/2))
    }
    var stft = shortTimeFT(1,1024,onFreq);
    // var istft = shortTimeFT(-1,1024,onTime);

    var result;

    const drawable = DrawableArray("formants",width,height);
    const drawnResult = DrawableArray("result",1024,300);
    $(document).ready(()=>{
        $("#formants").append(drawable.getElement());
        $("#formants").append(drawnResult.getElement());
        $("#displays").append(visualizer());
    })

    drawable.onChange(()=>{
        const arr = drawable.getArray();
        stft(arr);
    })

})()

module.exports = Fourier;
},{"./audioplayer.js":1,"stft":35}],12:[function(require,module,exports){
var teoria = require("teoria");
var piano = require("./piano.js");
var Converter = require("./converter.js");
var TimbreControls = require("./timbreControls.js");
var OtherInterpretationsOfNotes = require("./otherInterpretationsOfNotes.js");
var AudioPlayer = require("./audioplayer.js");
var Fourier = require("./fourier.js");

const showRecentNotes = () => {
    console.log("setup");
    piano.onPlayNote(()=>{
        console.log("played note");
        const notes = piano.getRecentNotes(4);
        const descriptions = notes.map(Converter.frequencyToName)
        $("#currentNote").text(descriptions.toString());
    })
}
const on = (char,f) => {
    const charcode = char.charCodeAt(0);
    const keycode = charcode - 97 + 65;
    $("body").keydown(e=>{
        if(e.keyCode == keycode){
            f();
        }
    })
}

const setVowelControls = () => {
    const onV = (char,vowel)=>{
        on(char,()=>AudioPlayer.setVowel(vowel));
    }
    
    onV("q","ow");
    onV("w","oo");
    onV("e","u");
    onV("r","a");
    onV("t","uh");
    onV("y","er");
    onV("u","ae");
    onV("i","e");
    // onV("o","i");
    onV("o","m");
    onV("p","iy");
}



$(document).ready(()=>{
    OtherInterpretationsOfNotes.setup();
    TimbreControls.setup();
    piano.setup();
    setVowelControls();
    showRecentNotes();
})

},{"./audioplayer.js":1,"./converter.js":3,"./fourier.js":11,"./otherInterpretationsOfNotes.js":45,"./piano.js":46,"./timbreControls.js":49,"teoria":36}],13:[function(require,module,exports){

const MusicPlayer = (()=>{
    const BPM = 160;
    const BEAT_UNIT = 4;
    
    var notes = [];
    var stopping = false;

    const playTune = notes => {
        stopping = false;
        playTuneRecurse(notes);
    }
    const playTuneRecurse = notes => {
        if(!stopping && notes.length > 0){
            playNote(notes[0]).then(()=>{
                playTuneRecurse(notes.slice(1));
            }) 
        }
        else{
            console.log("done playing tune");
        }
    }
    const playNote = note => {
        return new Promise((resolve,reject)=>{
            const id = Math.random();
            const duration = note.durationInSeconds(BPM,BEAT_UNIT) * 1000; // ms
            console.log("playing note",note.toString(),"for",duration);
            AudioPlayer.playTone({frequency:note.fq()},id);
            setTimeout(()=>{
                AudioPlayer.stopTone(id)
                resolve();
            },duration);
        })
        
    }
    const stop = () => {
        stopping = true;
    }
    const setScale = scale => _scale=scale;

    return ({
        playTune:playTune,
        setScale:setScale,
        stop:stop
    })
})();
},{}],14:[function(require,module,exports){
var accidentalValues = {
  'bb': -2,
  'b': -1,
  '': 0,
  '#': 1,
  'x': 2
};

module.exports = function accidentalNumber(acc) {
  return accidentalValues[acc];
}

module.exports.interval = function accidentalInterval(acc) {
  var val = accidentalValues[acc];
  return [-4 * val, 7 * val];
}

},{}],15:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);
  
  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;
  
  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],16:[function(require,module,exports){
"use strict"

var Parser = require("./lib/parser.js")
  , createShim = require("./lib/shim.js")

var REQUIRED_FIELDS = [ "args", "body" ]
var OPTIONAL_FIELDS = [ "pre", "post", "printCode" ]

function CompiledProcedure() {
  this.numArgs = 0
  this.numArrayArgs = 0
  this.numScalarArgs = 0
  this.hasIndex = false
  this.hasShape = false
  this.hasReturn = false
  this.pre = ""
  this.body = ""
  this.post = ""
  this.unroll = 1
  this.printCode = false
}

function compile(user_args) {
  for(var id in user_args) {
    if(REQUIRED_FIELDS.indexOf(id) < 0 &&
       OPTIONAL_FIELDS.indexOf(id) < 0) {
      throw new Error("Unknown argument '"+id+"' passed to expression compiler")
    }
  }
  for(var i=0; i<REQUIRED_FIELDS.length; ++i) {
    if(!user_args[REQUIRED_FIELDS[i]]) {
      throw new Error("Missing argument: " + REQUIRED_FIELDS[i])
    }
  }
  //Parse arguments
  var proc = new CompiledProcedure()
  var proc_args = user_args.args.slice(0)
  var shim_args = []
  for(var i=0; i<proc_args.length; ++i) {
    switch(proc_args[i]) {
      case "array":
        shim_args.push("array" + proc.numArrayArgs)
        proc_args[i] += (proc.numArrayArgs++)
      break
      case "scalar":
        shim_args.push("scalar" + proc.numScalarArgs)
        proc_args[i] += (proc.numScalarArgs++)
      break
      case "index":
        proc.hasIndex = true
      break
      case "shape":
        proc.hasShape = true
      break
      default:
        throw new Error("Unknown argument types")
    }
  }
  if(proc.numArrayArgs <= 0) {
    throw new Error("No array arguments specified")
  }
  
  //Parse blocks
  var parser = new Parser(proc_args)
    , pre = user_args.pre || null
    , body = user_args.body
    , post = user_args.post || null
  parser.preprocess(pre)
  parser.preprocess(body)
  parser.preprocess(post)
  proc.pre  = parser.preBlock() + "\n" + parser.process(pre)
  proc.body = parser.process(body)
  proc.post = parser.process(post) + "\n" + parser.postBlock()
  proc.hasReturn = parser.hasReturn
  
  //Parse options
  proc.printCode = user_args.printCode || false
  
  //Assemble shim
  return createShim(shim_args, proc)
}

module.exports = compile

},{"./lib/parser.js":18,"./lib/shim.js":19}],17:[function(require,module,exports){
"use strict"

var RECURSION_LIMIT = 32

function innerFill(order, procedure) {
  var dimension = order.length
    , nargs = procedure.numArrayArgs
    , has_index = procedure.hasIndex
    , code = []
    , idx=0, pidx=0, i, j
  for(i=0; i<dimension; ++i) {
    code.push("var i"+i+"=0;")
  }
  //Compute scan deltas
  for(j=0; j<nargs; ++j) {
    for(i=0; i<dimension; ++i) {
      pidx = idx
      idx = order[i]
      if(i === 0) {
        code.push("var d"+j+"s"+i+"=stride"+j+"["+idx+"]|0;")
      } else {
        code.push("var d"+j+"s"+i+"=(stride"+j+"["+idx+"]-shape["+pidx+"]*stride"+j+"["+pidx+"])|0;")
      }
    }
  }
  //Outer scan loop
  for(i=dimension-1; i>=0; --i) {
    idx = order[i]
    code.push("for(i"+i+"=shape["+idx+"]|0;--i"+i+">=0;){")
  }
  //Push body of inner loop
  code.push(procedure.body)
  //Advance scan pointers
  for(i=0; i<dimension; ++i) {
    pidx = idx
    idx = order[i]
    for(j=0; j<nargs; ++j) {
      code.push("ptr"+j+"+=d"+j+"s"+i)
    }
    if(has_index) {
      if(i > 0) {
        code.push("index["+pidx+"]-=shape["+pidx+"]")
      }
      code.push("++index["+idx+"]")
    }
    code.push("}")
  }
  return code.join("\n")
}

function outerFill(matched, order, procedure) {
  var dimension = order.length
    , nargs = procedure.numArrayArgs
    , has_index = procedure.hasIndex
    , code = []
    , static_args = dimension
    , index_start = nargs + static_args
    , frame_size = index_start + (has_index ? dimension : 0)
    , i
  
  //Initiaize variables
  code.push("var i=0,l=0,v=0,d=0,sp=0")
  
  //Begin recursion
  code.push("while(true){")
    
    //Walk over runs to get bounds
    code.push("l="+RECURSION_LIMIT)
    code.push("v="+RECURSION_LIMIT)
    code.push("d="+matched)
  
    for(i=matched; i<dimension; ++i) {
      code.push("if(shape["+i+"]>l){")
        code.push("v=l|0")
        code.push("l=shape["+i+"]|0")
        code.push("d="+i+"|0")
      code.push("}else if(shape["+i+"]>v){")
        code.push("v=shape["+i+"]|0")
      code.push("}")
    }
  
    code.push("if(l<="+RECURSION_LIMIT+"){")
      code.push(innerFill(order, procedure))
    code.push("} else {")
  
      //Round v to previous power of 2
      code.push("v=(v>>>1)-1")
      code.push("for(i=1;i<=16;i<<=1){v|=v>>>i}")
      code.push("++v")
      code.push("if(v<"+RECURSION_LIMIT+") v="+RECURSION_LIMIT)
  
      //Set shape
      code.push("i=shape[d]")
      code.push("shape[d]=v")
  
      //Fill across row
      code.push("for(;i>=v;i-=v){")
        for(i=0; i<dimension; ++i) {
          code.push("STACK[sp+"+i+"]=shape["+i+"]")
        }
        for(i=0; i<nargs; ++i) {
          code.push("STACK[sp+"+(i+static_args)+"]=ptr"+i+"|0")
        }
        if(has_index) {
          for(i=0; i<dimension; ++i) {
            code.push("STACK[sp+"+(i+index_start)+"]=index["+i+"]")
          }
          code.push("index[d]+=v")
        }
        for(i=0; i<nargs; ++i) {
          code.push("ptr"+i+"+=(v*stride"+i+"[d])|0")
        }
        code.push("sp+="+frame_size)
      code.push("}")
  
      //Handle edge case
      code.push("if(i>0){")
        code.push("shape[d]=i")
        for(i=0; i<dimension; ++i) {
          code.push("STACK[sp+"+i+"]=shape["+i+"]")
        }
        for(i=0; i<nargs; ++i) {
          code.push("STACK[sp+"+(i+static_args)+"]=ptr"+i+"|0")
        }
        if(has_index) {
          for(i=0; i<dimension; ++i) {
            code.push("STACK[sp+"+(i+index_start)+"]=index["+i+"]")
          }
        }
        code.push("sp+="+frame_size)
      code.push("}")
    code.push("}")
  
    //Pop previous state
    code.push("if(sp<=0){")
      code.push("break")
    code.push("}")
    code.push("sp-="+frame_size)
    for(i=0; i<dimension; ++i) {
      code.push("shape["+i+"]=STACK[sp+"+i+"]")
    }
    for(i=0; i<nargs; ++i) {
      code.push("ptr"+i+"=STACK[sp+"+(i+static_args)+"]")
    }
    if(has_index) {
      for(i=0; i<dimension; ++i) {
        code.push("index["+i+"]=STACK[sp+"+(i+index_start)+"]")
      }
    }
 code.push("}")
 return code.join("\n")
}

function majorOrder(orders) {
  return orders[0]
}

function generate(orders, procedure) {
  var order = majorOrder(orders)
    , dimension = orders[0].length
    , nargs = procedure.numArrayArgs
    , code = ['"use strict"']
    , matched, i, j
    , arglist = [ "STACK", "shape" ]
  //Create procedure arguments
  for(i = 0; i<nargs; ++i) {
    arglist.push("arr" + i)
    arglist.push("ptr" + i)
    arglist.push("stride" + i)
    code.push("ptr"+i+"|=0")
    for(j = 0; j<dimension; ++j) {
      code.push("stride"+i+"["+j+"]|=0")
    }
  }
  for(i = 0; i<dimension; ++i) {
    code.push("shape["+i+"]|=0")
  }
  for(i = 0; i<procedure.numScalarArgs; ++i) {
    arglist.push("scalar"+i)
  }
  if(procedure.hasIndex) {
    code.push("var index=[")
    for(i=0; i<dimension; ++i) {
      code.push((i > 0) ? ",0":"0")
    }
    code.push("]")
  }
  if(procedure.hasShape) {
    code.push("var inline_shape=shape.slice(0)")
  }
  //Compute number of matching orders
  matched = 0;
matched_loop:
  while(matched < dimension) {
    for(j=1; j<nargs; ++j) {
      if(orders[j][matched] !== orders[0][matched]) {
        break matched_loop;
      }
    }
    ++matched;
  }
  //Generate code
  code.push(procedure.pre)
  if(matched === dimension) {
    code.push(innerFill(order, procedure))
  } else {
    code.push(outerFill(matched, order, procedure))
  }
  code.push(procedure.post)
  arglist.push(code.join("\n"))
  //Return result
  var result = Function.apply(null, arglist)
  if(procedure.printCode) {
    console.log("For order:", orders, "Generated code: \n", result+"")
  }
  return result
}

module.exports = generate
},{}],18:[function(require,module,exports){
"use strict"

var falafel = require("falafel")

function isGlobal(identifier) {
  if(typeof(window) !== "undefined") {
    return identifier in window
  } else if(typeof(GLOBAL) !== "undefined") {
    return identifier in GLOBAL
  } else {
    return false
  }
}

function getArgs(src) {
  var args = []
  falafel(src, function(node) {
    var i
    if(node.type === "FunctionExpression" &&
       node.parent.parent.parent.type === "Program") {
      args = new Array(node.params.length)
      for(i=0; i<node.params.length; ++i) {
        args[i] = node.params[i].name
      }
    }
  })
  return args
}

function Parser(args) {
  this.args = args
  this.this_vars = []
  this.computed_this = false
  this.prefix_count = 0
  this.hasReturn = false
}

//Preprocessing pass is needed to explode the "this" object
Parser.prototype.preprocess = function(func) {
  if(!func || this.computed_this) {
    return
  }
  var src = "(" + func + ")()"
    , this_vars = this.this_vars
    , computed_this = this.computed_this
  falafel(src, function(node) {
    var n
    if(node.type === "ThisExpression") {
      if(node.parent.type === "MemberExpression" && !node.parent.computed) {
        n = node.parent.property.name
        if(this_vars.indexOf(n) < 0) {
          this_vars.push(n)
        }
      } else {
        computed_this = true
      }
    }
  })
  if(computed_this) {
    this.this_vars = []
  }
  this.computed_this = computed_this
}

Parser.prototype.process = function(func) {
  if(!func) {
    return ""
  }
  var label = this.prefix_count++
    , src = "(" + func + ")()"
    , block_args = getArgs(src)
    , proc_args = this.args
    , result = ""
    , inline_prefix = "inline" + label + "_"
    , hasReturn = this.hasReturn
  falafel(src, function(node) {
    var n, i, j
    if(node.type === "FunctionExpression" &&
       node.parent.parent.parent.type === "Program") {
      result = node.body.source()
    } else if(node.type === "Identifier") {
      if(node.parent.type === "MemberExpression") {
        if((node.parent.property === node && !node.parent.computed) ||
           node.parent.object.type === "ThisExpression") {
          return
        }
      }
      n = node.name
      i = block_args.indexOf(n)
      if(i >= 0) {
        if(i < proc_args.length) {
          if(proc_args[i].indexOf("array") === 0) {
            j = parseInt(proc_args[i].substr(5))
            node.update("arr"+j+"[ptr"+j+"]")
          } else if(proc_args[i] === "shape") {
            node.update("inline_shape")
          } else {
            node.update(proc_args[i])
          }
        } else {
          node.update(inline_prefix + node.source())
        }
      } else if(isGlobal(n)) {
        return
      } else {
        node.update(inline_prefix + node.source())
      }
    } else if(node.type === "MemberExpression") {
      if(node.object.type === "ThisExpression") {
        node.update("this_" + node.property.source().trimLeft())
      }
    } else if(node.type === "ThisExpression") {
      if(node.parent.type !== "MemberExpression") {
        node.update("this_")
      }
    } else if(node.type === "ReturnStatement") {
      hasReturn = true
    }
  })
  this.hasReturn = hasReturn
  var prefix = ""
  for(var i=this.args.length; i<block_args.length; ++i) {
    prefix += "var " + block_args[i] + "\n"
  }
  return prefix + result
}

Parser.prototype.preBlock = function() {
  if(this.computed_this) {
    return "var this_={}"
  } else if(this.this_vars.length > 0) {
    return "var this_" + this.this_vars.join(",this_")
  } else {
    return ""
  }
}

Parser.prototype.postBlock = function() {
  return ""
}

module.exports = Parser
},{"falafel":23}],19:[function(require,module,exports){
"use strict"

var generate = require("./generate.js")

//Reuse stack across all shims
var STACK = new Int32Array(1024)

function Shim(procedure) {
  this.memoized = {}
  this.procedure = procedure
}

Shim.prototype.checkShape = function(a, b) {
  if(a.length !== b.length) {
    throw new Error("Shape mismatch")
  }
  for(var i=a.length-1; i>=0; --i) {
    if(a[i] !== b[i]) {
      throw new Error("Shape mismatch")
    }
  }
}

Shim.prototype.getStack = function(size) {
  if(size < STACK.length) {
    return STACK
  }
  STACK = new Int32Array(size)
  return STACK
}

function compare1st(a,b) { return a[0] - b[0]; }

Shim.prototype.getOrder = function(stride) {
  var zipped = new Array(stride.length)
  for(var i=0; i<stride.length; ++i) {
    zipped[i] = [Math.abs(stride[i]), i]
  }
  zipped.sort(compare1st)
  var unzipped = new Array(stride.length)
  for(var i=0; i<stride.length; ++i) {
    unzipped[i] = zipped[i][1]
  }
  return unzipped
}

Shim.prototype.getProc = function(orders) {
  var proc_name = orders.join("|")
    , proc = this.memoized[proc_name]
  if(!proc) {
    proc = generate(orders, this.procedure)
    this.memoized[proc_name] = proc
  }
  return proc
}

function createShim(shim_args, procedure) {
  var code = ["\"use strict\""], i
  //Check shapes
  for(i=1; i<procedure.numArrayArgs; ++i) {
    code.push("this.checkShape(array0.shape,array"+i+".shape)")
  }
  //Load/lazily generate procedure based on array ordering
  code.push("var proc = this.getProc([")
  for(i=0; i<procedure.numArrayArgs; ++i) {
    code.push((i>0 ? "," : "") + "this.getOrder(array"+i+".stride)")
  }
  code.push("])")
  //Call procedure
  if(procedure.hasReturn) {
    code.push("return proc(")
  } else {
    code.push("proc(")
  }
  code.push("this.getStack(" + procedure.numArrayArgs + "*(array0.shape.length*32)), array0.shape.slice(0)")
  //Bind array arguments
  for(i=0; i<procedure.numArrayArgs; ++i) {
    code.push(",array" + i + ".data")
    code.push(",array" + i + ".offset")
    code.push(",array" + i + ".stride")
  }
  //Bind scalar arguments
  for(var i=0; i<procedure.numScalarArgs; ++i) {
    code.push(",scalar"+i)
  }
  code.push(")")
  if(!procedure.hasReturn) {
    code.push("return array0")
  }
  //Create the shim
  shim_args.push(code.join("\n"))
  var result = Function.apply(null, shim_args)
  if(procedure.printCode) {
    console.log("Generated shim:", result + "")
  }
  return result.bind(new Shim(procedure))
}

module.exports = createShim


},{"./generate.js":17}],20:[function(require,module,exports){
var SYMBOLS = {
  'm': ['m3', 'P5'],
  'mi': ['m3', 'P5'],
  'min': ['m3', 'P5'],
  '-': ['m3', 'P5'],

  'M': ['M3', 'P5'],
  'ma': ['M3', 'P5'],
  '': ['M3', 'P5'],

  '+': ['M3', 'A5'],
  'aug': ['M3', 'A5'],

  'dim': ['m3', 'd5'],
  'o': ['m3', 'd5'],

  'maj': ['M3', 'P5', 'M7'],
  'dom': ['M3', 'P5', 'm7'],
  'ø': ['m3', 'd5', 'm7'],

  '5': ['P5'],

  '6/9': ['M3', 'P5', 'M6', 'M9']
};

module.exports = function(symbol) {
  var c, parsing = 'quality', additionals = [], name, chordLength = 2
  var notes = ['P1', 'M3', 'P5', 'm7', 'M9', 'P11', 'M13'];
  var explicitMajor = false;

  function setChord(name) {
    var intervals = SYMBOLS[name];
    for (var i = 0, len = intervals.length; i < len; i++) {
      notes[i + 1] = intervals[i];
    }

    chordLength = intervals.length;
  }

  // Remove whitespace, commas and parentheses
  symbol = symbol.replace(/[,\s\(\)]/g, '');
  for (var i = 0, len = symbol.length; i < len; i++) {
    if (!(c = symbol[i]))
      return;

    if (parsing === 'quality') {
      var sub3 = (i + 2) < len ? symbol.substr(i, 3).toLowerCase() : null;
      var sub2 = (i + 1) < len ? symbol.substr(i, 2).toLowerCase() : null;
      if (sub3 in SYMBOLS)
        name = sub3;
      else if (sub2 in SYMBOLS)
        name = sub2;
      else if (c in SYMBOLS)
        name = c;
      else
        name = '';

      if (name)
        setChord(name);

      if (name === 'M' || name === 'ma' || name === 'maj')
        explicitMajor = true;


      i += name.length - 1;
      parsing = 'extension';
    } else if (parsing === 'extension') {
      c = (c === '1' && symbol[i + 1]) ? +symbol.substr(i, 2) : +c;

      if (!isNaN(c) && c !== 6) {
        chordLength = (c - 1) / 2;

        if (chordLength !== Math.round(chordLength))
          return new Error('Invalid interval extension: ' + c.toString(10));

        if (name === 'o' || name === 'dim')
          notes[3] = 'd7';
        else if (explicitMajor)
          notes[3] = 'M7';

        i += c >= 10 ? 1 : 0;
      } else if (c === 6) {
        notes[3] = 'M6';
        chordLength = Math.max(3, chordLength);
      } else
        i -= 1;

      parsing = 'alterations';
    } else if (parsing === 'alterations') {
      var alterations = symbol.substr(i).split(/(#|b|add|maj|sus|M)/i),
          next, flat = false, sharp = false;

      if (alterations.length === 1)
        return new Error('Invalid alteration');
      else if (alterations[0].length !== 0)
        return new Error('Invalid token: \'' + alterations[0] + '\'');

      var ignore = false;
      alterations.forEach(function(alt, i, arr) {
        if (ignore || !alt.length)
          return ignore = false;

        var next = arr[i + 1], lower = alt.toLowerCase();
        if (alt === 'M' || lower === 'maj') {
          if (next === '7')
            ignore = true;

          chordLength = Math.max(3, chordLength);
          notes[3] = 'M7';
        } else if (lower === 'sus') {
          var type = 'P4';
          if (next === '2' || next === '4') {
            ignore = true;

            if (next === '2')
              type = 'M2';
          }

          notes[1] = type; // Replace third with M2 or P4
        } else if (lower === 'add') {
          if (next === '9')
            additionals.push('M9');
          else if (next === '11')
            additionals.push('P11');
          else if (next === '13')
            additionals.push('M13');

          ignore = true
        } else if (lower === 'b') {
          flat = true;
        } else if (lower === '#') {
          sharp = true;
        } else {
          var token = +alt, quality, intPos;
          if (isNaN(token) || String(token).length !== alt.length)
            return new Error('Invalid token: \'' + alt + '\'');

          if (token === 6) {
            if (sharp)
              notes[3] = 'A6';
            else if (flat)
              notes[3] = 'm6';
            else
              notes[3] = 'M6';

            chordLength = Math.max(3, chordLength);
            return;
          }

          // Calculate the position in the 'note' array
          intPos = (token - 1) / 2;
          if (chordLength < intPos)
            chordLength = intPos;

          if (token < 5 || token === 7 || intPos !== Math.round(intPos))
            return new Error('Invalid interval alteration: ' + token);

          quality = notes[intPos][0];

          // Alterate the quality of the interval according the accidentals
          if (sharp) {
            if (quality === 'd')
              quality = 'm';
            else if (quality === 'm')
              quality = 'M';
            else if (quality === 'M' || quality === 'P')
              quality = 'A';
          } else if (flat) {
            if (quality === 'A')
              quality = 'M';
            else if (quality === 'M')
              quality = 'm';
            else if (quality === 'm' || quality === 'P')
              quality = 'd';
          }

          sharp = flat = false;
          notes[intPos] = quality + token;
        }
      });
      parsing = 'ended';
    } else if (parsing === 'ended') {
      break;
    }
  }

  return notes.slice(0, chordLength + 1).concat(additionals);
}

},{}],21:[function(require,module,exports){
"use strict"

function dupe_array(count, value, i) {
  var c = count[i]|0
  if(c <= 0) {
    return []
  }
  var result = new Array(c), j
  if(i === count.length-1) {
    for(j=0; j<c; ++j) {
      result[j] = value
    }
  } else {
    for(j=0; j<c; ++j) {
      result[j] = dupe_array(count, value, i+1)
    }
  }
  return result
}

function dupe_number(count, value) {
  var result, i
  result = new Array(count)
  for(i=0; i<count; ++i) {
    result[i] = value
  }
  return result
}

function dupe(count, value) {
  if(typeof value === "undefined") {
    value = 0
  }
  switch(typeof count) {
    case "number":
      if(count > 0) {
        return dupe_number(count|0, value)
      }
    break
    case "object":
      if(typeof (count.length) === "number") {
        return dupe_array(count, value, 0)
      }
    break
  }
  return []
}

module.exports = dupe
},{}],22:[function(require,module,exports){
/*
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2012 Mathias Bynens <mathias@qiwi.be>
  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>
  Copyright (C) 2011 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*jslint bitwise:true plusplus:true */
/*global esprima:true, define:true, exports:true, window: true,
throwError: true, createLiteral: true, generateStatement: true,
parseAssignmentExpression: true, parseBlock: true, parseExpression: true,
parseFunctionDeclaration: true, parseFunctionExpression: true,
parseFunctionSourceElements: true, parseVariableIdentifier: true,
parseLeftHandSideExpression: true,
parseStatement: true, parseSourceElement: true */

(function (root, factory) {
    'use strict';

    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // Rhino, and plain browser loading.
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports !== 'undefined') {
        factory(exports);
    } else {
        factory((root.esprima = {}));
    }
}(this, function (exports) {
    'use strict';

    var Token,
        TokenName,
        Syntax,
        PropertyKind,
        Messages,
        Regex,
        source,
        strict,
        index,
        lineNumber,
        lineStart,
        length,
        buffer,
        state,
        extra;

    Token = {
        BooleanLiteral: 1,
        EOF: 2,
        Identifier: 3,
        Keyword: 4,
        NullLiteral: 5,
        NumericLiteral: 6,
        Punctuator: 7,
        StringLiteral: 8
    };

    TokenName = {};
    TokenName[Token.BooleanLiteral] = 'Boolean';
    TokenName[Token.EOF] = '<end>';
    TokenName[Token.Identifier] = 'Identifier';
    TokenName[Token.Keyword] = 'Keyword';
    TokenName[Token.NullLiteral] = 'Null';
    TokenName[Token.NumericLiteral] = 'Numeric';
    TokenName[Token.Punctuator] = 'Punctuator';
    TokenName[Token.StringLiteral] = 'String';

    Syntax = {
        AssignmentExpression: 'AssignmentExpression',
        ArrayExpression: 'ArrayExpression',
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DoWhileStatement: 'DoWhileStatement',
        DebuggerStatement: 'DebuggerStatement',
        EmptyStatement: 'EmptyStatement',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        Program: 'Program',
        Property: 'Property',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement'
    };

    PropertyKind = {
        Data: 1,
        Get: 2,
        Set: 4
    };

    // Error messages should be identical to V8.
    Messages = {
        UnexpectedToken:  'Unexpected token %0',
        UnexpectedNumber:  'Unexpected number',
        UnexpectedString:  'Unexpected string',
        UnexpectedIdentifier:  'Unexpected identifier',
        UnexpectedReserved:  'Unexpected reserved word',
        UnexpectedEOS:  'Unexpected end of input',
        NewlineAfterThrow:  'Illegal newline after throw',
        InvalidRegExp: 'Invalid regular expression',
        UnterminatedRegExp:  'Invalid regular expression: missing /',
        InvalidLHSInAssignment:  'Invalid left-hand side in assignment',
        InvalidLHSInForIn:  'Invalid left-hand side in for-in',
        MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
        NoCatchOrFinally:  'Missing catch or finally after try',
        UnknownLabel: 'Undefined label \'%0\'',
        Redeclaration: '%0 \'%1\' has already been declared',
        IllegalContinue: 'Illegal continue statement',
        IllegalBreak: 'Illegal break statement',
        IllegalReturn: 'Illegal return statement',
        StrictModeWith:  'Strict mode code may not include a with statement',
        StrictCatchVariable:  'Catch variable may not be eval or arguments in strict mode',
        StrictVarName:  'Variable name may not be eval or arguments in strict mode',
        StrictParamName:  'Parameter name eval or arguments is not allowed in strict mode',
        StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
        StrictFunctionName:  'Function name may not be eval or arguments in strict mode',
        StrictOctalLiteral:  'Octal literals are not allowed in strict mode.',
        StrictDelete:  'Delete of an unqualified identifier in strict mode.',
        StrictDuplicateProperty:  'Duplicate data property in object literal not allowed in strict mode',
        AccessorDataProperty:  'Object literal may not have data and accessor property with the same name',
        AccessorGetSet:  'Object literal may not have multiple get/set accessors with the same name',
        StrictLHSAssignment:  'Assignment to eval or arguments is not allowed in strict mode',
        StrictLHSPostfix:  'Postfix increment/decrement may not have eval or arguments operand in strict mode',
        StrictLHSPrefix:  'Prefix increment/decrement may not have eval or arguments operand in strict mode',
        StrictReservedWord:  'Use of future reserved word in strict mode'
    };

    // See also tools/generate-unicode-regex.py.
    Regex = {
        NonAsciiIdentifierStart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]'),
        NonAsciiIdentifierPart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0300-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u0483-\u0487\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u05d0-\u05ea\u05f0-\u05f2\u0610-\u061a\u0620-\u0669\u066e-\u06d3\u06d5-\u06dc\u06df-\u06e8\u06ea-\u06fc\u06ff\u0710-\u074a\u074d-\u07b1\u07c0-\u07f5\u07fa\u0800-\u082d\u0840-\u085b\u08a0\u08a2-\u08ac\u08e4-\u08fe\u0900-\u0963\u0966-\u096f\u0971-\u0977\u0979-\u097f\u0981-\u0983\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bc-\u09c4\u09c7\u09c8\u09cb-\u09ce\u09d7\u09dc\u09dd\u09df-\u09e3\u09e6-\u09f1\u0a01-\u0a03\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a59-\u0a5c\u0a5e\u0a66-\u0a75\u0a81-\u0a83\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abc-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ad0\u0ae0-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3c-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5c\u0b5d\u0b5f-\u0b63\u0b66-\u0b6f\u0b71\u0b82\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd0\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c58\u0c59\u0c60-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbc-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0cde\u0ce0-\u0ce3\u0ce6-\u0cef\u0cf1\u0cf2\u0d02\u0d03\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d-\u0d44\u0d46-\u0d48\u0d4a-\u0d4e\u0d57\u0d60-\u0d63\u0d66-\u0d6f\u0d7a-\u0d7f\u0d82\u0d83\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e01-\u0e3a\u0e40-\u0e4e\u0e50-\u0e59\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb9\u0ebb-\u0ebd\u0ec0-\u0ec4\u0ec6\u0ec8-\u0ecd\u0ed0-\u0ed9\u0edc-\u0edf\u0f00\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e-\u0f47\u0f49-\u0f6c\u0f71-\u0f84\u0f86-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1049\u1050-\u109d\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u135d-\u135f\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176c\u176e-\u1770\u1772\u1773\u1780-\u17d3\u17d7\u17dc\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1820-\u1877\u1880-\u18aa\u18b0-\u18f5\u1900-\u191c\u1920-\u192b\u1930-\u193b\u1946-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u19d0-\u19d9\u1a00-\u1a1b\u1a20-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1aa7\u1b00-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1bf3\u1c00-\u1c37\u1c40-\u1c49\u1c4d-\u1c7d\u1cd0-\u1cd2\u1cd4-\u1cf6\u1d00-\u1de6\u1dfc-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u200c\u200d\u203f\u2040\u2054\u2071\u207f\u2090-\u209c\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d7f-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2de0-\u2dff\u2e2f\u3005-\u3007\u3021-\u302f\u3031-\u3035\u3038-\u303c\u3041-\u3096\u3099\u309a\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua62b\ua640-\ua66f\ua674-\ua67d\ua67f-\ua697\ua69f-\ua6f1\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua827\ua840-\ua873\ua880-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f7\ua8fb\ua900-\ua92d\ua930-\ua953\ua960-\ua97c\ua980-\ua9c0\ua9cf-\ua9d9\uaa00-\uaa36\uaa40-\uaa4d\uaa50-\uaa59\uaa60-\uaa76\uaa7a\uaa7b\uaa80-\uaac2\uaadb-\uaadd\uaae0-\uaaef\uaaf2-\uaaf6\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabea\uabec\uabed\uabf0-\uabf9\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\ufe70-\ufe74\ufe76-\ufefc\uff10-\uff19\uff21-\uff3a\uff3f\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]')
    };

    // Ensure the condition is true, otherwise throw an error.
    // This is only to have a better contract semantic, i.e. another safety net
    // to catch a logic error. The condition shall be fulfilled in normal case.
    // Do NOT use this to enforce a certain condition on any user input.

    function assert(condition, message) {
        if (!condition) {
            throw new Error('ASSERT: ' + message);
        }
    }

    function sliceSource(from, to) {
        return source.slice(from, to);
    }

    if (typeof 'esprima'[0] === 'undefined') {
        sliceSource = function sliceArraySource(from, to) {
            return source.slice(from, to).join('');
        };
    }

    function isDecimalDigit(ch) {
        return '0123456789'.indexOf(ch) >= 0;
    }

    function isHexDigit(ch) {
        return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
    }

    function isOctalDigit(ch) {
        return '01234567'.indexOf(ch) >= 0;
    }


    // 7.2 White Space

    function isWhiteSpace(ch) {
        return (ch === ' ') || (ch === '\u0009') || (ch === '\u000B') ||
            (ch === '\u000C') || (ch === '\u00A0') ||
            (ch.charCodeAt(0) >= 0x1680 &&
             '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(ch) >= 0);
    }

    // 7.3 Line Terminators

    function isLineTerminator(ch) {
        return (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029');
    }

    // 7.6 Identifier Names and Identifiers

    function isIdentifierStart(ch) {
        return (ch === '$') || (ch === '_') || (ch === '\\') ||
            (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            ((ch.charCodeAt(0) >= 0x80) && Regex.NonAsciiIdentifierStart.test(ch));
    }

    function isIdentifierPart(ch) {
        return (ch === '$') || (ch === '_') || (ch === '\\') ||
            (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            ((ch >= '0') && (ch <= '9')) ||
            ((ch.charCodeAt(0) >= 0x80) && Regex.NonAsciiIdentifierPart.test(ch));
    }

    // 7.6.1.2 Future Reserved Words

    function isFutureReservedWord(id) {
        switch (id) {

        // Future reserved words.
        case 'class':
        case 'enum':
        case 'export':
        case 'extends':
        case 'import':
        case 'super':
            return true;
        }

        return false;
    }

    function isStrictModeReservedWord(id) {
        switch (id) {

        // Strict Mode reserved words.
        case 'implements':
        case 'interface':
        case 'package':
        case 'private':
        case 'protected':
        case 'public':
        case 'static':
        case 'yield':
        case 'let':
            return true;
        }

        return false;
    }

    function isRestrictedWord(id) {
        return id === 'eval' || id === 'arguments';
    }

    // 7.6.1.1 Keywords

    function isKeyword(id) {
        var keyword = false;
        switch (id.length) {
        case 2:
            keyword = (id === 'if') || (id === 'in') || (id === 'do');
            break;
        case 3:
            keyword = (id === 'var') || (id === 'for') || (id === 'new') || (id === 'try');
            break;
        case 4:
            keyword = (id === 'this') || (id === 'else') || (id === 'case') || (id === 'void') || (id === 'with');
            break;
        case 5:
            keyword = (id === 'while') || (id === 'break') || (id === 'catch') || (id === 'throw');
            break;
        case 6:
            keyword = (id === 'return') || (id === 'typeof') || (id === 'delete') || (id === 'switch');
            break;
        case 7:
            keyword = (id === 'default') || (id === 'finally');
            break;
        case 8:
            keyword = (id === 'function') || (id === 'continue') || (id === 'debugger');
            break;
        case 10:
            keyword = (id === 'instanceof');
            break;
        }

        if (keyword) {
            return true;
        }

        switch (id) {
        // Future reserved words.
        // 'const' is specialized as Keyword in V8.
        case 'const':
            return true;

        // For compatiblity to SpiderMonkey and ES.next
        case 'yield':
        case 'let':
            return true;
        }

        if (strict && isStrictModeReservedWord(id)) {
            return true;
        }

        return isFutureReservedWord(id);
    }

    // 7.4 Comments

    function skipComment() {
        var ch, blockComment, lineComment;

        blockComment = false;
        lineComment = false;

        while (index < length) {
            ch = source[index];

            if (lineComment) {
                ch = source[index++];
                if (isLineTerminator(ch)) {
                    lineComment = false;
                    if (ch === '\r' && source[index] === '\n') {
                        ++index;
                    }
                    ++lineNumber;
                    lineStart = index;
                }
            } else if (blockComment) {
                if (isLineTerminator(ch)) {
                    if (ch === '\r' && source[index + 1] === '\n') {
                        ++index;
                    }
                    ++lineNumber;
                    ++index;
                    lineStart = index;
                    if (index >= length) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                } else {
                    ch = source[index++];
                    if (index >= length) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                    if (ch === '*') {
                        ch = source[index];
                        if (ch === '/') {
                            ++index;
                            blockComment = false;
                        }
                    }
                }
            } else if (ch === '/') {
                ch = source[index + 1];
                if (ch === '/') {
                    index += 2;
                    lineComment = true;
                } else if (ch === '*') {
                    index += 2;
                    blockComment = true;
                    if (index >= length) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                } else {
                    break;
                }
            } else if (isWhiteSpace(ch)) {
                ++index;
            } else if (isLineTerminator(ch)) {
                ++index;
                if (ch ===  '\r' && source[index] === '\n') {
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
            } else {
                break;
            }
        }
    }

    function scanHexEscape(prefix) {
        var i, len, ch, code = 0;

        len = (prefix === 'u') ? 4 : 2;
        for (i = 0; i < len; ++i) {
            if (index < length && isHexDigit(source[index])) {
                ch = source[index++];
                code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
            } else {
                return '';
            }
        }
        return String.fromCharCode(code);
    }

    function scanIdentifier() {
        var ch, start, id, restore;

        ch = source[index];
        if (!isIdentifierStart(ch)) {
            return;
        }

        start = index;
        if (ch === '\\') {
            ++index;
            if (source[index] !== 'u') {
                return;
            }
            ++index;
            restore = index;
            ch = scanHexEscape('u');
            if (ch) {
                if (ch === '\\' || !isIdentifierStart(ch)) {
                    return;
                }
                id = ch;
            } else {
                index = restore;
                id = 'u';
            }
        } else {
            id = source[index++];
        }

        while (index < length) {
            ch = source[index];
            if (!isIdentifierPart(ch)) {
                break;
            }
            if (ch === '\\') {
                ++index;
                if (source[index] !== 'u') {
                    return;
                }
                ++index;
                restore = index;
                ch = scanHexEscape('u');
                if (ch) {
                    if (ch === '\\' || !isIdentifierPart(ch)) {
                        return;
                    }
                    id += ch;
                } else {
                    index = restore;
                    id += 'u';
                }
            } else {
                id += source[index++];
            }
        }

        // There is no keyword or literal with only one character.
        // Thus, it must be an identifier.
        if (id.length === 1) {
            return {
                type: Token.Identifier,
                value: id,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        if (isKeyword(id)) {
            return {
                type: Token.Keyword,
                value: id,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        // 7.8.1 Null Literals

        if (id === 'null') {
            return {
                type: Token.NullLiteral,
                value: id,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        // 7.8.2 Boolean Literals

        if (id === 'true' || id === 'false') {
            return {
                type: Token.BooleanLiteral,
                value: id,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        return {
            type: Token.Identifier,
            value: id,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [start, index]
        };
    }

    // 7.7 Punctuators

    function scanPunctuator() {
        var start = index,
            ch1 = source[index],
            ch2,
            ch3,
            ch4;

        // Check for most common single-character punctuators.

        if (ch1 === ';' || ch1 === '{' || ch1 === '}') {
            ++index;
            return {
                type: Token.Punctuator,
                value: ch1,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        if (ch1 === ',' || ch1 === '(' || ch1 === ')') {
            ++index;
            return {
                type: Token.Punctuator,
                value: ch1,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        // Dot (.) can also start a floating-point number, hence the need
        // to check the next character.

        ch2 = source[index + 1];
        if (ch1 === '.' && !isDecimalDigit(ch2)) {
            return {
                type: Token.Punctuator,
                value: source[index++],
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        // Peek more characters.

        ch3 = source[index + 2];
        ch4 = source[index + 3];

        // 4-character punctuator: >>>=

        if (ch1 === '>' && ch2 === '>' && ch3 === '>') {
            if (ch4 === '=') {
                index += 4;
                return {
                    type: Token.Punctuator,
                    value: '>>>=',
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    range: [start, index]
                };
            }
        }

        // 3-character punctuators: === !== >>> <<= >>=

        if (ch1 === '=' && ch2 === '=' && ch3 === '=') {
            index += 3;
            return {
                type: Token.Punctuator,
                value: '===',
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        if (ch1 === '!' && ch2 === '=' && ch3 === '=') {
            index += 3;
            return {
                type: Token.Punctuator,
                value: '!==',
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        if (ch1 === '>' && ch2 === '>' && ch3 === '>') {
            index += 3;
            return {
                type: Token.Punctuator,
                value: '>>>',
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        if (ch1 === '<' && ch2 === '<' && ch3 === '=') {
            index += 3;
            return {
                type: Token.Punctuator,
                value: '<<=',
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        if (ch1 === '>' && ch2 === '>' && ch3 === '=') {
            index += 3;
            return {
                type: Token.Punctuator,
                value: '>>=',
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }

        // 2-character punctuators: <= >= == != ++ -- << >> && ||
        // += -= *= %= &= |= ^= /=

        if (ch2 === '=') {
            if ('<>=!+-*%&|^/'.indexOf(ch1) >= 0) {
                index += 2;
                return {
                    type: Token.Punctuator,
                    value: ch1 + ch2,
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    range: [start, index]
                };
            }
        }

        if (ch1 === ch2 && ('+-<>&|'.indexOf(ch1) >= 0)) {
            if ('+-<>&|'.indexOf(ch2) >= 0) {
                index += 2;
                return {
                    type: Token.Punctuator,
                    value: ch1 + ch2,
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    range: [start, index]
                };
            }
        }

        // The remaining 1-character punctuators.

        if ('[]<>+-*%&|^!~?:=/'.indexOf(ch1) >= 0) {
            return {
                type: Token.Punctuator,
                value: source[index++],
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [start, index]
            };
        }
    }

    // 7.8.3 Numeric Literals

    function scanNumericLiteral() {
        var number, start, ch;

        ch = source[index];
        assert(isDecimalDigit(ch) || (ch === '.'),
            'Numeric literal must start with a decimal digit or a decimal point');

        start = index;
        number = '';
        if (ch !== '.') {
            number = source[index++];
            ch = source[index];

            // Hex number starts with '0x'.
            // Octal number starts with '0'.
            if (number === '0') {
                if (ch === 'x' || ch === 'X') {
                    number += source[index++];
                    while (index < length) {
                        ch = source[index];
                        if (!isHexDigit(ch)) {
                            break;
                        }
                        number += source[index++];
                    }

                    if (number.length <= 2) {
                        // only 0x
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }

                    if (index < length) {
                        ch = source[index];
                        if (isIdentifierStart(ch)) {
                            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                        }
                    }
                    return {
                        type: Token.NumericLiteral,
                        value: parseInt(number, 16),
                        lineNumber: lineNumber,
                        lineStart: lineStart,
                        range: [start, index]
                    };
                } else if (isOctalDigit(ch)) {
                    number += source[index++];
                    while (index < length) {
                        ch = source[index];
                        if (!isOctalDigit(ch)) {
                            break;
                        }
                        number += source[index++];
                    }

                    if (index < length) {
                        ch = source[index];
                        if (isIdentifierStart(ch) || isDecimalDigit(ch)) {
                            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                        }
                    }
                    return {
                        type: Token.NumericLiteral,
                        value: parseInt(number, 8),
                        octal: true,
                        lineNumber: lineNumber,
                        lineStart: lineStart,
                        range: [start, index]
                    };
                }

                // decimal number starts with '0' such as '09' is illegal.
                if (isDecimalDigit(ch)) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
            }

            while (index < length) {
                ch = source[index];
                if (!isDecimalDigit(ch)) {
                    break;
                }
                number += source[index++];
            }
        }

        if (ch === '.') {
            number += source[index++];
            while (index < length) {
                ch = source[index];
                if (!isDecimalDigit(ch)) {
                    break;
                }
                number += source[index++];
            }
        }

        if (ch === 'e' || ch === 'E') {
            number += source[index++];

            ch = source[index];
            if (ch === '+' || ch === '-') {
                number += source[index++];
            }

            ch = source[index];
            if (isDecimalDigit(ch)) {
                number += source[index++];
                while (index < length) {
                    ch = source[index];
                    if (!isDecimalDigit(ch)) {
                        break;
                    }
                    number += source[index++];
                }
            } else {
                ch = 'character ' + ch;
                if (index >= length) {
                    ch = '<end>';
                }
                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
            }
        }

        if (index < length) {
            ch = source[index];
            if (isIdentifierStart(ch)) {
                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
            }
        }

        return {
            type: Token.NumericLiteral,
            value: parseFloat(number),
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [start, index]
        };
    }

    // 7.8.4 String Literals

    function scanStringLiteral() {
        var str = '', quote, start, ch, code, unescaped, restore, octal = false;

        quote = source[index];
        assert((quote === '\'' || quote === '"'),
            'String literal must starts with a quote');

        start = index;
        ++index;

        while (index < length) {
            ch = source[index++];

            if (ch === quote) {
                quote = '';
                break;
            } else if (ch === '\\') {
                ch = source[index++];
                if (!isLineTerminator(ch)) {
                    switch (ch) {
                    case 'n':
                        str += '\n';
                        break;
                    case 'r':
                        str += '\r';
                        break;
                    case 't':
                        str += '\t';
                        break;
                    case 'u':
                    case 'x':
                        restore = index;
                        unescaped = scanHexEscape(ch);
                        if (unescaped) {
                            str += unescaped;
                        } else {
                            index = restore;
                            str += ch;
                        }
                        break;
                    case 'b':
                        str += '\b';
                        break;
                    case 'f':
                        str += '\f';
                        break;
                    case 'v':
                        str += '\x0B';
                        break;

                    default:
                        if (isOctalDigit(ch)) {
                            code = '01234567'.indexOf(ch);

                            // \0 is not octal escape sequence
                            if (code !== 0) {
                                octal = true;
                            }

                            if (index < length && isOctalDigit(source[index])) {
                                octal = true;
                                code = code * 8 + '01234567'.indexOf(source[index++]);

                                // 3 digits are only allowed when string starts
                                // with 0, 1, 2, 3
                                if ('0123'.indexOf(ch) >= 0 &&
                                        index < length &&
                                        isOctalDigit(source[index])) {
                                    code = code * 8 + '01234567'.indexOf(source[index++]);
                                }
                            }
                            str += String.fromCharCode(code);
                        } else {
                            str += ch;
                        }
                        break;
                    }
                } else {
                    ++lineNumber;
                    if (ch ===  '\r' && source[index] === '\n') {
                        ++index;
                    }
                }
            } else if (isLineTerminator(ch)) {
                break;
            } else {
                str += ch;
            }
        }

        if (quote !== '') {
            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
        }

        return {
            type: Token.StringLiteral,
            value: str,
            octal: octal,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [start, index]
        };
    }

    function scanRegExp() {
        var str, ch, start, pattern, flags, value, classMarker = false, restore, terminated = false;

        buffer = null;
        skipComment();

        start = index;
        ch = source[index];
        assert(ch === '/', 'Regular expression literal must start with a slash');
        str = source[index++];

        while (index < length) {
            ch = source[index++];
            str += ch;
            if (ch === '\\') {
                ch = source[index++];
                // ECMA-262 7.8.5
                if (isLineTerminator(ch)) {
                    throwError({}, Messages.UnterminatedRegExp);
                }
                str += ch;
            } else if (classMarker) {
                if (ch === ']') {
                    classMarker = false;
                }
            } else {
                if (ch === '/') {
                    terminated = true;
                    break;
                } else if (ch === '[') {
                    classMarker = true;
                } else if (isLineTerminator(ch)) {
                    throwError({}, Messages.UnterminatedRegExp);
                }
            }
        }

        if (!terminated) {
            throwError({}, Messages.UnterminatedRegExp);
        }

        // Exclude leading and trailing slash.
        pattern = str.substr(1, str.length - 2);

        flags = '';
        while (index < length) {
            ch = source[index];
            if (!isIdentifierPart(ch)) {
                break;
            }

            ++index;
            if (ch === '\\' && index < length) {
                ch = source[index];
                if (ch === 'u') {
                    ++index;
                    restore = index;
                    ch = scanHexEscape('u');
                    if (ch) {
                        flags += ch;
                        str += '\\u';
                        for (; restore < index; ++restore) {
                            str += source[restore];
                        }
                    } else {
                        index = restore;
                        flags += 'u';
                        str += '\\u';
                    }
                } else {
                    str += '\\';
                }
            } else {
                flags += ch;
                str += ch;
            }
        }

        try {
            value = new RegExp(pattern, flags);
        } catch (e) {
            throwError({}, Messages.InvalidRegExp);
        }

        return {
            literal: str,
            value: value,
            range: [start, index]
        };
    }

    function isIdentifierName(token) {
        return token.type === Token.Identifier ||
            token.type === Token.Keyword ||
            token.type === Token.BooleanLiteral ||
            token.type === Token.NullLiteral;
    }

    function advance() {
        var ch, token;

        skipComment();

        if (index >= length) {
            return {
                type: Token.EOF,
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [index, index]
            };
        }

        token = scanPunctuator();
        if (typeof token !== 'undefined') {
            return token;
        }

        ch = source[index];

        if (ch === '\'' || ch === '"') {
            return scanStringLiteral();
        }

        if (ch === '.' || isDecimalDigit(ch)) {
            return scanNumericLiteral();
        }

        token = scanIdentifier();
        if (typeof token !== 'undefined') {
            return token;
        }

        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }

    function lex() {
        var token;

        if (buffer) {
            index = buffer.range[1];
            lineNumber = buffer.lineNumber;
            lineStart = buffer.lineStart;
            token = buffer;
            buffer = null;
            return token;
        }

        buffer = null;
        return advance();
    }

    function lookahead() {
        var pos, line, start;

        if (buffer !== null) {
            return buffer;
        }

        pos = index;
        line = lineNumber;
        start = lineStart;
        buffer = advance();
        index = pos;
        lineNumber = line;
        lineStart = start;

        return buffer;
    }

    // Return true if there is a line terminator before the next token.

    function peekLineTerminator() {
        var pos, line, start, found;

        pos = index;
        line = lineNumber;
        start = lineStart;
        skipComment();
        found = lineNumber !== line;
        index = pos;
        lineNumber = line;
        lineStart = start;

        return found;
    }

    // Throw an exception

    function throwError(token, messageFormat) {
        var error,
            args = Array.prototype.slice.call(arguments, 2),
            msg = messageFormat.replace(
                /%(\d)/g,
                function (whole, index) {
                    return args[index] || '';
                }
            );

        if (typeof token.lineNumber === 'number') {
            error = new Error('Line ' + token.lineNumber + ': ' + msg);
            error.index = token.range[0];
            error.lineNumber = token.lineNumber;
            error.column = token.range[0] - lineStart + 1;
        } else {
            error = new Error('Line ' + lineNumber + ': ' + msg);
            error.index = index;
            error.lineNumber = lineNumber;
            error.column = index - lineStart + 1;
        }

        throw error;
    }

    function throwErrorTolerant() {
        try {
            throwError.apply(null, arguments);
        } catch (e) {
            if (extra.errors) {
                extra.errors.push(e);
            } else {
                throw e;
            }
        }
    }


    // Throw an exception because of the token.

    function throwUnexpected(token) {
        if (token.type === Token.EOF) {
            throwError(token, Messages.UnexpectedEOS);
        }

        if (token.type === Token.NumericLiteral) {
            throwError(token, Messages.UnexpectedNumber);
        }

        if (token.type === Token.StringLiteral) {
            throwError(token, Messages.UnexpectedString);
        }

        if (token.type === Token.Identifier) {
            throwError(token, Messages.UnexpectedIdentifier);
        }

        if (token.type === Token.Keyword) {
            if (isFutureReservedWord(token.value)) {
                throwError(token, Messages.UnexpectedReserved);
            } else if (strict && isStrictModeReservedWord(token.value)) {
                throwErrorTolerant(token, Messages.StrictReservedWord);
                return;
            }
            throwError(token, Messages.UnexpectedToken, token.value);
        }

        // BooleanLiteral, NullLiteral, or Punctuator.
        throwError(token, Messages.UnexpectedToken, token.value);
    }

    // Expect the next token to match the specified punctuator.
    // If not, an exception will be thrown.

    function expect(value) {
        var token = lex();
        if (token.type !== Token.Punctuator || token.value !== value) {
            throwUnexpected(token);
        }
    }

    // Expect the next token to match the specified keyword.
    // If not, an exception will be thrown.

    function expectKeyword(keyword) {
        var token = lex();
        if (token.type !== Token.Keyword || token.value !== keyword) {
            throwUnexpected(token);
        }
    }

    // Return true if the next token matches the specified punctuator.

    function match(value) {
        var token = lookahead();
        return token.type === Token.Punctuator && token.value === value;
    }

    // Return true if the next token matches the specified keyword

    function matchKeyword(keyword) {
        var token = lookahead();
        return token.type === Token.Keyword && token.value === keyword;
    }

    // Return true if the next token is an assignment operator

    function matchAssign() {
        var token = lookahead(),
            op = token.value;

        if (token.type !== Token.Punctuator) {
            return false;
        }
        return op === '=' ||
            op === '*=' ||
            op === '/=' ||
            op === '%=' ||
            op === '+=' ||
            op === '-=' ||
            op === '<<=' ||
            op === '>>=' ||
            op === '>>>=' ||
            op === '&=' ||
            op === '^=' ||
            op === '|=';
    }

    function consumeSemicolon() {
        var token, line;

        // Catch the very common case first.
        if (source[index] === ';') {
            lex();
            return;
        }

        line = lineNumber;
        skipComment();
        if (lineNumber !== line) {
            return;
        }

        if (match(';')) {
            lex();
            return;
        }

        token = lookahead();
        if (token.type !== Token.EOF && !match('}')) {
            throwUnexpected(token);
        }
    }

    // Return true if provided expression is LeftHandSideExpression

    function isLeftHandSide(expr) {
        return expr.type === Syntax.Identifier || expr.type === Syntax.MemberExpression;
    }

    // 11.1.4 Array Initialiser

    function parseArrayInitialiser() {
        var elements = [];

        expect('[');

        while (!match(']')) {
            if (match(',')) {
                lex();
                elements.push(null);
            } else {
                elements.push(parseAssignmentExpression());

                if (!match(']')) {
                    expect(',');
                }
            }
        }

        expect(']');

        return {
            type: Syntax.ArrayExpression,
            elements: elements
        };
    }

    // 11.1.5 Object Initialiser

    function parsePropertyFunction(param, first) {
        var previousStrict, body;

        previousStrict = strict;
        body = parseFunctionSourceElements();
        if (first && strict && isRestrictedWord(param[0].name)) {
            throwErrorTolerant(first, Messages.StrictParamName);
        }
        strict = previousStrict;

        return {
            type: Syntax.FunctionExpression,
            id: null,
            params: param,
            defaults: [],
            body: body,
            rest: null,
            generator: false,
            expression: false
        };
    }

    function parseObjectPropertyKey() {
        var token = lex();

        // Note: This function is called only from parseObjectProperty(), where
        // EOF and Punctuator tokens are already filtered out.

        if (token.type === Token.StringLiteral || token.type === Token.NumericLiteral) {
            if (strict && token.octal) {
                throwErrorTolerant(token, Messages.StrictOctalLiteral);
            }
            return createLiteral(token);
        }

        return {
            type: Syntax.Identifier,
            name: token.value
        };
    }

    function parseObjectProperty() {
        var token, key, id, param;

        token = lookahead();

        if (token.type === Token.Identifier) {

            id = parseObjectPropertyKey();

            // Property Assignment: Getter and Setter.

            if (token.value === 'get' && !match(':')) {
                key = parseObjectPropertyKey();
                expect('(');
                expect(')');
                return {
                    type: Syntax.Property,
                    key: key,
                    value: parsePropertyFunction([]),
                    kind: 'get'
                };
            } else if (token.value === 'set' && !match(':')) {
                key = parseObjectPropertyKey();
                expect('(');
                token = lookahead();
                if (token.type !== Token.Identifier) {
                    expect(')');
                    throwErrorTolerant(token, Messages.UnexpectedToken, token.value);
                    return {
                        type: Syntax.Property,
                        key: key,
                        value: parsePropertyFunction([]),
                        kind: 'set'
                    };
                } else {
                    param = [ parseVariableIdentifier() ];
                    expect(')');
                    return {
                        type: Syntax.Property,
                        key: key,
                        value: parsePropertyFunction(param, token),
                        kind: 'set'
                    };
                }
            } else {
                expect(':');
                return {
                    type: Syntax.Property,
                    key: id,
                    value: parseAssignmentExpression(),
                    kind: 'init'
                };
            }
        } else if (token.type === Token.EOF || token.type === Token.Punctuator) {
            throwUnexpected(token);
        } else {
            key = parseObjectPropertyKey();
            expect(':');
            return {
                type: Syntax.Property,
                key: key,
                value: parseAssignmentExpression(),
                kind: 'init'
            };
        }
    }

    function parseObjectInitialiser() {
        var properties = [], property, name, kind, map = {}, toString = String;

        expect('{');

        while (!match('}')) {
            property = parseObjectProperty();

            if (property.key.type === Syntax.Identifier) {
                name = property.key.name;
            } else {
                name = toString(property.key.value);
            }
            kind = (property.kind === 'init') ? PropertyKind.Data : (property.kind === 'get') ? PropertyKind.Get : PropertyKind.Set;
            if (Object.prototype.hasOwnProperty.call(map, name)) {
                if (map[name] === PropertyKind.Data) {
                    if (strict && kind === PropertyKind.Data) {
                        throwErrorTolerant({}, Messages.StrictDuplicateProperty);
                    } else if (kind !== PropertyKind.Data) {
                        throwErrorTolerant({}, Messages.AccessorDataProperty);
                    }
                } else {
                    if (kind === PropertyKind.Data) {
                        throwErrorTolerant({}, Messages.AccessorDataProperty);
                    } else if (map[name] & kind) {
                        throwErrorTolerant({}, Messages.AccessorGetSet);
                    }
                }
                map[name] |= kind;
            } else {
                map[name] = kind;
            }

            properties.push(property);

            if (!match('}')) {
                expect(',');
            }
        }

        expect('}');

        return {
            type: Syntax.ObjectExpression,
            properties: properties
        };
    }

    // 11.1.6 The Grouping Operator

    function parseGroupExpression() {
        var expr;

        expect('(');

        expr = parseExpression();

        expect(')');

        return expr;
    }


    // 11.1 Primary Expressions

    function parsePrimaryExpression() {
        var token = lookahead(),
            type = token.type;

        if (type === Token.Identifier) {
            return {
                type: Syntax.Identifier,
                name: lex().value
            };
        }

        if (type === Token.StringLiteral || type === Token.NumericLiteral) {
            if (strict && token.octal) {
                throwErrorTolerant(token, Messages.StrictOctalLiteral);
            }
            return createLiteral(lex());
        }

        if (type === Token.Keyword) {
            if (matchKeyword('this')) {
                lex();
                return {
                    type: Syntax.ThisExpression
                };
            }

            if (matchKeyword('function')) {
                return parseFunctionExpression();
            }
        }

        if (type === Token.BooleanLiteral) {
            lex();
            token.value = (token.value === 'true');
            return createLiteral(token);
        }

        if (type === Token.NullLiteral) {
            lex();
            token.value = null;
            return createLiteral(token);
        }

        if (match('[')) {
            return parseArrayInitialiser();
        }

        if (match('{')) {
            return parseObjectInitialiser();
        }

        if (match('(')) {
            return parseGroupExpression();
        }

        if (match('/') || match('/=')) {
            return createLiteral(scanRegExp());
        }

        return throwUnexpected(lex());
    }

    // 11.2 Left-Hand-Side Expressions

    function parseArguments() {
        var args = [];

        expect('(');

        if (!match(')')) {
            while (index < length) {
                args.push(parseAssignmentExpression());
                if (match(')')) {
                    break;
                }
                expect(',');
            }
        }

        expect(')');

        return args;
    }

    function parseNonComputedProperty() {
        var token = lex();

        if (!isIdentifierName(token)) {
            throwUnexpected(token);
        }

        return {
            type: Syntax.Identifier,
            name: token.value
        };
    }

    function parseNonComputedMember() {
        expect('.');

        return parseNonComputedProperty();
    }

    function parseComputedMember() {
        var expr;

        expect('[');

        expr = parseExpression();

        expect(']');

        return expr;
    }

    function parseNewExpression() {
        var expr;

        expectKeyword('new');

        expr = {
            type: Syntax.NewExpression,
            callee: parseLeftHandSideExpression(),
            'arguments': []
        };

        if (match('(')) {
            expr['arguments'] = parseArguments();
        }

        return expr;
    }

    function parseLeftHandSideExpressionAllowCall() {
        var expr;

        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

        while (match('.') || match('[') || match('(')) {
            if (match('(')) {
                expr = {
                    type: Syntax.CallExpression,
                    callee: expr,
                    'arguments': parseArguments()
                };
            } else if (match('[')) {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: true,
                    object: expr,
                    property: parseComputedMember()
                };
            } else {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: false,
                    object: expr,
                    property: parseNonComputedMember()
                };
            }
        }

        return expr;
    }


    function parseLeftHandSideExpression() {
        var expr;

        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

        while (match('.') || match('[')) {
            if (match('[')) {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: true,
                    object: expr,
                    property: parseComputedMember()
                };
            } else {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: false,
                    object: expr,
                    property: parseNonComputedMember()
                };
            }
        }

        return expr;
    }

    // 11.3 Postfix Expressions

    function parsePostfixExpression() {
        var expr = parseLeftHandSideExpressionAllowCall(), token;

        token = lookahead();
        if (token.type !== Token.Punctuator) {
            return expr;
        }

        if ((match('++') || match('--')) && !peekLineTerminator()) {
            // 11.3.1, 11.3.2
            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                throwErrorTolerant({}, Messages.StrictLHSPostfix);
            }
            if (!isLeftHandSide(expr)) {
                throwErrorTolerant({}, Messages.InvalidLHSInAssignment);
            }

            expr = {
                type: Syntax.UpdateExpression,
                operator: lex().value,
                argument: expr,
                prefix: false
            };
        }

        return expr;
    }

    // 11.4 Unary Operators

    function parseUnaryExpression() {
        var token, expr;

        token = lookahead();
        if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
            return parsePostfixExpression();
        }

        if (match('++') || match('--')) {
            token = lex();
            expr = parseUnaryExpression();
            // 11.4.4, 11.4.5
            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                throwErrorTolerant({}, Messages.StrictLHSPrefix);
            }

            if (!isLeftHandSide(expr)) {
                throwErrorTolerant({}, Messages.InvalidLHSInAssignment);
            }

            expr = {
                type: Syntax.UpdateExpression,
                operator: token.value,
                argument: expr,
                prefix: true
            };
            return expr;
        }

        if (match('+') || match('-') || match('~') || match('!')) {
            expr = {
                type: Syntax.UnaryExpression,
                operator: lex().value,
                argument: parseUnaryExpression(),
                prefix: true
            };
            return expr;
        }

        if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
            expr = {
                type: Syntax.UnaryExpression,
                operator: lex().value,
                argument: parseUnaryExpression(),
                prefix: true
            };
            if (strict && expr.operator === 'delete' && expr.argument.type === Syntax.Identifier) {
                throwErrorTolerant({}, Messages.StrictDelete);
            }
            return expr;
        }

        return parsePostfixExpression();
    }

    // 11.5 Multiplicative Operators

    function parseMultiplicativeExpression() {
        var expr = parseUnaryExpression();

        while (match('*') || match('/') || match('%')) {
            expr = {
                type: Syntax.BinaryExpression,
                operator: lex().value,
                left: expr,
                right: parseUnaryExpression()
            };
        }

        return expr;
    }

    // 11.6 Additive Operators

    function parseAdditiveExpression() {
        var expr = parseMultiplicativeExpression();

        while (match('+') || match('-')) {
            expr = {
                type: Syntax.BinaryExpression,
                operator: lex().value,
                left: expr,
                right: parseMultiplicativeExpression()
            };
        }

        return expr;
    }

    // 11.7 Bitwise Shift Operators

    function parseShiftExpression() {
        var expr = parseAdditiveExpression();

        while (match('<<') || match('>>') || match('>>>')) {
            expr = {
                type: Syntax.BinaryExpression,
                operator: lex().value,
                left: expr,
                right: parseAdditiveExpression()
            };
        }

        return expr;
    }
    // 11.8 Relational Operators

    function parseRelationalExpression() {
        var expr, previousAllowIn;

        previousAllowIn = state.allowIn;
        state.allowIn = true;

        expr = parseShiftExpression();

        while (match('<') || match('>') || match('<=') || match('>=') || (previousAllowIn && matchKeyword('in')) || matchKeyword('instanceof')) {
            expr = {
                type: Syntax.BinaryExpression,
                operator: lex().value,
                left: expr,
                right: parseShiftExpression()
            };
        }

        state.allowIn = previousAllowIn;
        return expr;
    }

    // 11.9 Equality Operators

    function parseEqualityExpression() {
        var expr = parseRelationalExpression();

        while (match('==') || match('!=') || match('===') || match('!==')) {
            expr = {
                type: Syntax.BinaryExpression,
                operator: lex().value,
                left: expr,
                right: parseRelationalExpression()
            };
        }

        return expr;
    }

    // 11.10 Binary Bitwise Operators

    function parseBitwiseANDExpression() {
        var expr = parseEqualityExpression();

        while (match('&')) {
            lex();
            expr = {
                type: Syntax.BinaryExpression,
                operator: '&',
                left: expr,
                right: parseEqualityExpression()
            };
        }

        return expr;
    }

    function parseBitwiseXORExpression() {
        var expr = parseBitwiseANDExpression();

        while (match('^')) {
            lex();
            expr = {
                type: Syntax.BinaryExpression,
                operator: '^',
                left: expr,
                right: parseBitwiseANDExpression()
            };
        }

        return expr;
    }

    function parseBitwiseORExpression() {
        var expr = parseBitwiseXORExpression();

        while (match('|')) {
            lex();
            expr = {
                type: Syntax.BinaryExpression,
                operator: '|',
                left: expr,
                right: parseBitwiseXORExpression()
            };
        }

        return expr;
    }

    // 11.11 Binary Logical Operators

    function parseLogicalANDExpression() {
        var expr = parseBitwiseORExpression();

        while (match('&&')) {
            lex();
            expr = {
                type: Syntax.LogicalExpression,
                operator: '&&',
                left: expr,
                right: parseBitwiseORExpression()
            };
        }

        return expr;
    }

    function parseLogicalORExpression() {
        var expr = parseLogicalANDExpression();

        while (match('||')) {
            lex();
            expr = {
                type: Syntax.LogicalExpression,
                operator: '||',
                left: expr,
                right: parseLogicalANDExpression()
            };
        }

        return expr;
    }

    // 11.12 Conditional Operator

    function parseConditionalExpression() {
        var expr, previousAllowIn, consequent;

        expr = parseLogicalORExpression();

        if (match('?')) {
            lex();
            previousAllowIn = state.allowIn;
            state.allowIn = true;
            consequent = parseAssignmentExpression();
            state.allowIn = previousAllowIn;
            expect(':');

            expr = {
                type: Syntax.ConditionalExpression,
                test: expr,
                consequent: consequent,
                alternate: parseAssignmentExpression()
            };
        }

        return expr;
    }

    // 11.13 Assignment Operators

    function parseAssignmentExpression() {
        var token, expr;

        token = lookahead();
        expr = parseConditionalExpression();

        if (matchAssign()) {
            // LeftHandSideExpression
            if (!isLeftHandSide(expr)) {
                throwErrorTolerant({}, Messages.InvalidLHSInAssignment);
            }

            // 11.13.1
            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                throwErrorTolerant(token, Messages.StrictLHSAssignment);
            }

            expr = {
                type: Syntax.AssignmentExpression,
                operator: lex().value,
                left: expr,
                right: parseAssignmentExpression()
            };
        }

        return expr;
    }

    // 11.14 Comma Operator

    function parseExpression() {
        var expr = parseAssignmentExpression();

        if (match(',')) {
            expr = {
                type: Syntax.SequenceExpression,
                expressions: [ expr ]
            };

            while (index < length) {
                if (!match(',')) {
                    break;
                }
                lex();
                expr.expressions.push(parseAssignmentExpression());
            }

        }
        return expr;
    }

    // 12.1 Block

    function parseStatementList() {
        var list = [],
            statement;

        while (index < length) {
            if (match('}')) {
                break;
            }
            statement = parseSourceElement();
            if (typeof statement === 'undefined') {
                break;
            }
            list.push(statement);
        }

        return list;
    }

    function parseBlock() {
        var block;

        expect('{');

        block = parseStatementList();

        expect('}');

        return {
            type: Syntax.BlockStatement,
            body: block
        };
    }

    // 12.2 Variable Statement

    function parseVariableIdentifier() {
        var token = lex();

        if (token.type !== Token.Identifier) {
            throwUnexpected(token);
        }

        return {
            type: Syntax.Identifier,
            name: token.value
        };
    }

    function parseVariableDeclaration(kind) {
        var id = parseVariableIdentifier(),
            init = null;

        // 12.2.1
        if (strict && isRestrictedWord(id.name)) {
            throwErrorTolerant({}, Messages.StrictVarName);
        }

        if (kind === 'const') {
            expect('=');
            init = parseAssignmentExpression();
        } else if (match('=')) {
            lex();
            init = parseAssignmentExpression();
        }

        return {
            type: Syntax.VariableDeclarator,
            id: id,
            init: init
        };
    }

    function parseVariableDeclarationList(kind) {
        var list = [];

        do {
            list.push(parseVariableDeclaration(kind));
            if (!match(',')) {
                break;
            }
            lex();
        } while (index < length);

        return list;
    }

    function parseVariableStatement() {
        var declarations;

        expectKeyword('var');

        declarations = parseVariableDeclarationList();

        consumeSemicolon();

        return {
            type: Syntax.VariableDeclaration,
            declarations: declarations,
            kind: 'var'
        };
    }

    // kind may be `const` or `let`
    // Both are experimental and not in the specification yet.
    // see http://wiki.ecmascript.org/doku.php?id=harmony:const
    // and http://wiki.ecmascript.org/doku.php?id=harmony:let
    function parseConstLetDeclaration(kind) {
        var declarations;

        expectKeyword(kind);

        declarations = parseVariableDeclarationList(kind);

        consumeSemicolon();

        return {
            type: Syntax.VariableDeclaration,
            declarations: declarations,
            kind: kind
        };
    }

    // 12.3 Empty Statement

    function parseEmptyStatement() {
        expect(';');

        return {
            type: Syntax.EmptyStatement
        };
    }

    // 12.4 Expression Statement

    function parseExpressionStatement() {
        var expr = parseExpression();

        consumeSemicolon();

        return {
            type: Syntax.ExpressionStatement,
            expression: expr
        };
    }

    // 12.5 If statement

    function parseIfStatement() {
        var test, consequent, alternate;

        expectKeyword('if');

        expect('(');

        test = parseExpression();

        expect(')');

        consequent = parseStatement();

        if (matchKeyword('else')) {
            lex();
            alternate = parseStatement();
        } else {
            alternate = null;
        }

        return {
            type: Syntax.IfStatement,
            test: test,
            consequent: consequent,
            alternate: alternate
        };
    }

    // 12.6 Iteration Statements

    function parseDoWhileStatement() {
        var body, test, oldInIteration;

        expectKeyword('do');

        oldInIteration = state.inIteration;
        state.inIteration = true;

        body = parseStatement();

        state.inIteration = oldInIteration;

        expectKeyword('while');

        expect('(');

        test = parseExpression();

        expect(')');

        if (match(';')) {
            lex();
        }

        return {
            type: Syntax.DoWhileStatement,
            body: body,
            test: test
        };
    }

    function parseWhileStatement() {
        var test, body, oldInIteration;

        expectKeyword('while');

        expect('(');

        test = parseExpression();

        expect(')');

        oldInIteration = state.inIteration;
        state.inIteration = true;

        body = parseStatement();

        state.inIteration = oldInIteration;

        return {
            type: Syntax.WhileStatement,
            test: test,
            body: body
        };
    }

    function parseForVariableDeclaration() {
        var token = lex();

        return {
            type: Syntax.VariableDeclaration,
            declarations: parseVariableDeclarationList(),
            kind: token.value
        };
    }

    function parseForStatement() {
        var init, test, update, left, right, body, oldInIteration;

        init = test = update = null;

        expectKeyword('for');

        expect('(');

        if (match(';')) {
            lex();
        } else {
            if (matchKeyword('var') || matchKeyword('let')) {
                state.allowIn = false;
                init = parseForVariableDeclaration();
                state.allowIn = true;

                if (init.declarations.length === 1 && matchKeyword('in')) {
                    lex();
                    left = init;
                    right = parseExpression();
                    init = null;
                }
            } else {
                state.allowIn = false;
                init = parseExpression();
                state.allowIn = true;

                if (matchKeyword('in')) {
                    // LeftHandSideExpression
                    if (!isLeftHandSide(init)) {
                        throwErrorTolerant({}, Messages.InvalidLHSInForIn);
                    }

                    lex();
                    left = init;
                    right = parseExpression();
                    init = null;
                }
            }

            if (typeof left === 'undefined') {
                expect(';');
            }
        }

        if (typeof left === 'undefined') {

            if (!match(';')) {
                test = parseExpression();
            }
            expect(';');

            if (!match(')')) {
                update = parseExpression();
            }
        }

        expect(')');

        oldInIteration = state.inIteration;
        state.inIteration = true;

        body = parseStatement();

        state.inIteration = oldInIteration;

        if (typeof left === 'undefined') {
            return {
                type: Syntax.ForStatement,
                init: init,
                test: test,
                update: update,
                body: body
            };
        }

        return {
            type: Syntax.ForInStatement,
            left: left,
            right: right,
            body: body,
            each: false
        };
    }

    // 12.7 The continue statement

    function parseContinueStatement() {
        var token, label = null;

        expectKeyword('continue');

        // Optimize the most common form: 'continue;'.
        if (source[index] === ';') {
            lex();

            if (!state.inIteration) {
                throwError({}, Messages.IllegalContinue);
            }

            return {
                type: Syntax.ContinueStatement,
                label: null
            };
        }

        if (peekLineTerminator()) {
            if (!state.inIteration) {
                throwError({}, Messages.IllegalContinue);
            }

            return {
                type: Syntax.ContinueStatement,
                label: null
            };
        }

        token = lookahead();
        if (token.type === Token.Identifier) {
            label = parseVariableIdentifier();

            if (!Object.prototype.hasOwnProperty.call(state.labelSet, label.name)) {
                throwError({}, Messages.UnknownLabel, label.name);
            }
        }

        consumeSemicolon();

        if (label === null && !state.inIteration) {
            throwError({}, Messages.IllegalContinue);
        }

        return {
            type: Syntax.ContinueStatement,
            label: label
        };
    }

    // 12.8 The break statement

    function parseBreakStatement() {
        var token, label = null;

        expectKeyword('break');

        // Optimize the most common form: 'break;'.
        if (source[index] === ';') {
            lex();

            if (!(state.inIteration || state.inSwitch)) {
                throwError({}, Messages.IllegalBreak);
            }

            return {
                type: Syntax.BreakStatement,
                label: null
            };
        }

        if (peekLineTerminator()) {
            if (!(state.inIteration || state.inSwitch)) {
                throwError({}, Messages.IllegalBreak);
            }

            return {
                type: Syntax.BreakStatement,
                label: null
            };
        }

        token = lookahead();
        if (token.type === Token.Identifier) {
            label = parseVariableIdentifier();

            if (!Object.prototype.hasOwnProperty.call(state.labelSet, label.name)) {
                throwError({}, Messages.UnknownLabel, label.name);
            }
        }

        consumeSemicolon();

        if (label === null && !(state.inIteration || state.inSwitch)) {
            throwError({}, Messages.IllegalBreak);
        }

        return {
            type: Syntax.BreakStatement,
            label: label
        };
    }

    // 12.9 The return statement

    function parseReturnStatement() {
        var token, argument = null;

        expectKeyword('return');

        if (!state.inFunctionBody) {
            throwErrorTolerant({}, Messages.IllegalReturn);
        }

        // 'return' followed by a space and an identifier is very common.
        if (source[index] === ' ') {
            if (isIdentifierStart(source[index + 1])) {
                argument = parseExpression();
                consumeSemicolon();
                return {
                    type: Syntax.ReturnStatement,
                    argument: argument
                };
            }
        }

        if (peekLineTerminator()) {
            return {
                type: Syntax.ReturnStatement,
                argument: null
            };
        }

        if (!match(';')) {
            token = lookahead();
            if (!match('}') && token.type !== Token.EOF) {
                argument = parseExpression();
            }
        }

        consumeSemicolon();

        return {
            type: Syntax.ReturnStatement,
            argument: argument
        };
    }

    // 12.10 The with statement

    function parseWithStatement() {
        var object, body;

        if (strict) {
            throwErrorTolerant({}, Messages.StrictModeWith);
        }

        expectKeyword('with');

        expect('(');

        object = parseExpression();

        expect(')');

        body = parseStatement();

        return {
            type: Syntax.WithStatement,
            object: object,
            body: body
        };
    }

    // 12.10 The swith statement

    function parseSwitchCase() {
        var test,
            consequent = [],
            statement;

        if (matchKeyword('default')) {
            lex();
            test = null;
        } else {
            expectKeyword('case');
            test = parseExpression();
        }
        expect(':');

        while (index < length) {
            if (match('}') || matchKeyword('default') || matchKeyword('case')) {
                break;
            }
            statement = parseStatement();
            if (typeof statement === 'undefined') {
                break;
            }
            consequent.push(statement);
        }

        return {
            type: Syntax.SwitchCase,
            test: test,
            consequent: consequent
        };
    }

    function parseSwitchStatement() {
        var discriminant, cases, clause, oldInSwitch, defaultFound;

        expectKeyword('switch');

        expect('(');

        discriminant = parseExpression();

        expect(')');

        expect('{');

        cases = [];

        if (match('}')) {
            lex();
            return {
                type: Syntax.SwitchStatement,
                discriminant: discriminant,
                cases: cases
            };
        }

        oldInSwitch = state.inSwitch;
        state.inSwitch = true;
        defaultFound = false;

        while (index < length) {
            if (match('}')) {
                break;
            }
            clause = parseSwitchCase();
            if (clause.test === null) {
                if (defaultFound) {
                    throwError({}, Messages.MultipleDefaultsInSwitch);
                }
                defaultFound = true;
            }
            cases.push(clause);
        }

        state.inSwitch = oldInSwitch;

        expect('}');

        return {
            type: Syntax.SwitchStatement,
            discriminant: discriminant,
            cases: cases
        };
    }

    // 12.13 The throw statement

    function parseThrowStatement() {
        var argument;

        expectKeyword('throw');

        if (peekLineTerminator()) {
            throwError({}, Messages.NewlineAfterThrow);
        }

        argument = parseExpression();

        consumeSemicolon();

        return {
            type: Syntax.ThrowStatement,
            argument: argument
        };
    }

    // 12.14 The try statement

    function parseCatchClause() {
        var param;

        expectKeyword('catch');

        expect('(');
        if (match(')')) {
            throwUnexpected(lookahead());
        }

        param = parseVariableIdentifier();
        // 12.14.1
        if (strict && isRestrictedWord(param.name)) {
            throwErrorTolerant({}, Messages.StrictCatchVariable);
        }

        expect(')');

        return {
            type: Syntax.CatchClause,
            param: param,
            body: parseBlock()
        };
    }

    function parseTryStatement() {
        var block, handlers = [], finalizer = null;

        expectKeyword('try');

        block = parseBlock();

        if (matchKeyword('catch')) {
            handlers.push(parseCatchClause());
        }

        if (matchKeyword('finally')) {
            lex();
            finalizer = parseBlock();
        }

        if (handlers.length === 0 && !finalizer) {
            throwError({}, Messages.NoCatchOrFinally);
        }

        return {
            type: Syntax.TryStatement,
            block: block,
            guardedHandlers: [],
            handlers: handlers,
            finalizer: finalizer
        };
    }

    // 12.15 The debugger statement

    function parseDebuggerStatement() {
        expectKeyword('debugger');

        consumeSemicolon();

        return {
            type: Syntax.DebuggerStatement
        };
    }

    // 12 Statements

    function parseStatement() {
        var token = lookahead(),
            expr,
            labeledBody;

        if (token.type === Token.EOF) {
            throwUnexpected(token);
        }

        if (token.type === Token.Punctuator) {
            switch (token.value) {
            case ';':
                return parseEmptyStatement();
            case '{':
                return parseBlock();
            case '(':
                return parseExpressionStatement();
            default:
                break;
            }
        }

        if (token.type === Token.Keyword) {
            switch (token.value) {
            case 'break':
                return parseBreakStatement();
            case 'continue':
                return parseContinueStatement();
            case 'debugger':
                return parseDebuggerStatement();
            case 'do':
                return parseDoWhileStatement();
            case 'for':
                return parseForStatement();
            case 'function':
                return parseFunctionDeclaration();
            case 'if':
                return parseIfStatement();
            case 'return':
                return parseReturnStatement();
            case 'switch':
                return parseSwitchStatement();
            case 'throw':
                return parseThrowStatement();
            case 'try':
                return parseTryStatement();
            case 'var':
                return parseVariableStatement();
            case 'while':
                return parseWhileStatement();
            case 'with':
                return parseWithStatement();
            default:
                break;
            }
        }

        expr = parseExpression();

        // 12.12 Labelled Statements
        if ((expr.type === Syntax.Identifier) && match(':')) {
            lex();

            if (Object.prototype.hasOwnProperty.call(state.labelSet, expr.name)) {
                throwError({}, Messages.Redeclaration, 'Label', expr.name);
            }

            state.labelSet[expr.name] = true;
            labeledBody = parseStatement();
            delete state.labelSet[expr.name];

            return {
                type: Syntax.LabeledStatement,
                label: expr,
                body: labeledBody
            };
        }

        consumeSemicolon();

        return {
            type: Syntax.ExpressionStatement,
            expression: expr
        };
    }

    // 13 Function Definition

    function parseFunctionSourceElements() {
        var sourceElement, sourceElements = [], token, directive, firstRestricted,
            oldLabelSet, oldInIteration, oldInSwitch, oldInFunctionBody;

        expect('{');

        while (index < length) {
            token = lookahead();
            if (token.type !== Token.StringLiteral) {
                break;
            }

            sourceElement = parseSourceElement();
            sourceElements.push(sourceElement);
            if (sourceElement.expression.type !== Syntax.Literal) {
                // this is not directive
                break;
            }
            directive = sliceSource(token.range[0] + 1, token.range[1] - 1);
            if (directive === 'use strict') {
                strict = true;
                if (firstRestricted) {
                    throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
                }
            } else {
                if (!firstRestricted && token.octal) {
                    firstRestricted = token;
                }
            }
        }

        oldLabelSet = state.labelSet;
        oldInIteration = state.inIteration;
        oldInSwitch = state.inSwitch;
        oldInFunctionBody = state.inFunctionBody;

        state.labelSet = {};
        state.inIteration = false;
        state.inSwitch = false;
        state.inFunctionBody = true;

        while (index < length) {
            if (match('}')) {
                break;
            }
            sourceElement = parseSourceElement();
            if (typeof sourceElement === 'undefined') {
                break;
            }
            sourceElements.push(sourceElement);
        }

        expect('}');

        state.labelSet = oldLabelSet;
        state.inIteration = oldInIteration;
        state.inSwitch = oldInSwitch;
        state.inFunctionBody = oldInFunctionBody;

        return {
            type: Syntax.BlockStatement,
            body: sourceElements
        };
    }

    function parseFunctionDeclaration() {
        var id, param, params = [], body, token, stricted, firstRestricted, message, previousStrict, paramSet;

        expectKeyword('function');
        token = lookahead();
        id = parseVariableIdentifier();
        if (strict) {
            if (isRestrictedWord(token.value)) {
                throwErrorTolerant(token, Messages.StrictFunctionName);
            }
        } else {
            if (isRestrictedWord(token.value)) {
                firstRestricted = token;
                message = Messages.StrictFunctionName;
            } else if (isStrictModeReservedWord(token.value)) {
                firstRestricted = token;
                message = Messages.StrictReservedWord;
            }
        }

        expect('(');

        if (!match(')')) {
            paramSet = {};
            while (index < length) {
                token = lookahead();
                param = parseVariableIdentifier();
                if (strict) {
                    if (isRestrictedWord(token.value)) {
                        stricted = token;
                        message = Messages.StrictParamName;
                    }
                    if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
                        stricted = token;
                        message = Messages.StrictParamDupe;
                    }
                } else if (!firstRestricted) {
                    if (isRestrictedWord(token.value)) {
                        firstRestricted = token;
                        message = Messages.StrictParamName;
                    } else if (isStrictModeReservedWord(token.value)) {
                        firstRestricted = token;
                        message = Messages.StrictReservedWord;
                    } else if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
                        firstRestricted = token;
                        message = Messages.StrictParamDupe;
                    }
                }
                params.push(param);
                paramSet[param.name] = true;
                if (match(')')) {
                    break;
                }
                expect(',');
            }
        }

        expect(')');

        previousStrict = strict;
        body = parseFunctionSourceElements();
        if (strict && firstRestricted) {
            throwError(firstRestricted, message);
        }
        if (strict && stricted) {
            throwErrorTolerant(stricted, message);
        }
        strict = previousStrict;

        return {
            type: Syntax.FunctionDeclaration,
            id: id,
            params: params,
            defaults: [],
            body: body,
            rest: null,
            generator: false,
            expression: false
        };
    }

    function parseFunctionExpression() {
        var token, id = null, stricted, firstRestricted, message, param, params = [], body, previousStrict, paramSet;

        expectKeyword('function');

        if (!match('(')) {
            token = lookahead();
            id = parseVariableIdentifier();
            if (strict) {
                if (isRestrictedWord(token.value)) {
                    throwErrorTolerant(token, Messages.StrictFunctionName);
                }
            } else {
                if (isRestrictedWord(token.value)) {
                    firstRestricted = token;
                    message = Messages.StrictFunctionName;
                } else if (isStrictModeReservedWord(token.value)) {
                    firstRestricted = token;
                    message = Messages.StrictReservedWord;
                }
            }
        }

        expect('(');

        if (!match(')')) {
            paramSet = {};
            while (index < length) {
                token = lookahead();
                param = parseVariableIdentifier();
                if (strict) {
                    if (isRestrictedWord(token.value)) {
                        stricted = token;
                        message = Messages.StrictParamName;
                    }
                    if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
                        stricted = token;
                        message = Messages.StrictParamDupe;
                    }
                } else if (!firstRestricted) {
                    if (isRestrictedWord(token.value)) {
                        firstRestricted = token;
                        message = Messages.StrictParamName;
                    } else if (isStrictModeReservedWord(token.value)) {
                        firstRestricted = token;
                        message = Messages.StrictReservedWord;
                    } else if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
                        firstRestricted = token;
                        message = Messages.StrictParamDupe;
                    }
                }
                params.push(param);
                paramSet[param.name] = true;
                if (match(')')) {
                    break;
                }
                expect(',');
            }
        }

        expect(')');

        previousStrict = strict;
        body = parseFunctionSourceElements();
        if (strict && firstRestricted) {
            throwError(firstRestricted, message);
        }
        if (strict && stricted) {
            throwErrorTolerant(stricted, message);
        }
        strict = previousStrict;

        return {
            type: Syntax.FunctionExpression,
            id: id,
            params: params,
            defaults: [],
            body: body,
            rest: null,
            generator: false,
            expression: false
        };
    }

    // 14 Program

    function parseSourceElement() {
        var token = lookahead();

        if (token.type === Token.Keyword) {
            switch (token.value) {
            case 'const':
            case 'let':
                return parseConstLetDeclaration(token.value);
            case 'function':
                return parseFunctionDeclaration();
            default:
                return parseStatement();
            }
        }

        if (token.type !== Token.EOF) {
            return parseStatement();
        }
    }

    function parseSourceElements() {
        var sourceElement, sourceElements = [], token, directive, firstRestricted;

        while (index < length) {
            token = lookahead();
            if (token.type !== Token.StringLiteral) {
                break;
            }

            sourceElement = parseSourceElement();
            sourceElements.push(sourceElement);
            if (sourceElement.expression.type !== Syntax.Literal) {
                // this is not directive
                break;
            }
            directive = sliceSource(token.range[0] + 1, token.range[1] - 1);
            if (directive === 'use strict') {
                strict = true;
                if (firstRestricted) {
                    throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
                }
            } else {
                if (!firstRestricted && token.octal) {
                    firstRestricted = token;
                }
            }
        }

        while (index < length) {
            sourceElement = parseSourceElement();
            if (typeof sourceElement === 'undefined') {
                break;
            }
            sourceElements.push(sourceElement);
        }
        return sourceElements;
    }

    function parseProgram() {
        var program;
        strict = false;
        program = {
            type: Syntax.Program,
            body: parseSourceElements()
        };
        return program;
    }

    // The following functions are needed only when the option to preserve
    // the comments is active.

    function addComment(type, value, start, end, loc) {
        assert(typeof start === 'number', 'Comment must have valid position');

        // Because the way the actual token is scanned, often the comments
        // (if any) are skipped twice during the lexical analysis.
        // Thus, we need to skip adding a comment if the comment array already
        // handled it.
        if (extra.comments.length > 0) {
            if (extra.comments[extra.comments.length - 1].range[1] > start) {
                return;
            }
        }

        extra.comments.push({
            type: type,
            value: value,
            range: [start, end],
            loc: loc
        });
    }

    function scanComment() {
        var comment, ch, loc, start, blockComment, lineComment;

        comment = '';
        blockComment = false;
        lineComment = false;

        while (index < length) {
            ch = source[index];

            if (lineComment) {
                ch = source[index++];
                if (isLineTerminator(ch)) {
                    loc.end = {
                        line: lineNumber,
                        column: index - lineStart - 1
                    };
                    lineComment = false;
                    addComment('Line', comment, start, index - 1, loc);
                    if (ch === '\r' && source[index] === '\n') {
                        ++index;
                    }
                    ++lineNumber;
                    lineStart = index;
                    comment = '';
                } else if (index >= length) {
                    lineComment = false;
                    comment += ch;
                    loc.end = {
                        line: lineNumber,
                        column: length - lineStart
                    };
                    addComment('Line', comment, start, length, loc);
                } else {
                    comment += ch;
                }
            } else if (blockComment) {
                if (isLineTerminator(ch)) {
                    if (ch === '\r' && source[index + 1] === '\n') {
                        ++index;
                        comment += '\r\n';
                    } else {
                        comment += ch;
                    }
                    ++lineNumber;
                    ++index;
                    lineStart = index;
                    if (index >= length) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                } else {
                    ch = source[index++];
                    if (index >= length) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                    comment += ch;
                    if (ch === '*') {
                        ch = source[index];
                        if (ch === '/') {
                            comment = comment.substr(0, comment.length - 1);
                            blockComment = false;
                            ++index;
                            loc.end = {
                                line: lineNumber,
                                column: index - lineStart
                            };
                            addComment('Block', comment, start, index, loc);
                            comment = '';
                        }
                    }
                }
            } else if (ch === '/') {
                ch = source[index + 1];
                if (ch === '/') {
                    loc = {
                        start: {
                            line: lineNumber,
                            column: index - lineStart
                        }
                    };
                    start = index;
                    index += 2;
                    lineComment = true;
                    if (index >= length) {
                        loc.end = {
                            line: lineNumber,
                            column: index - lineStart
                        };
                        lineComment = false;
                        addComment('Line', comment, start, index, loc);
                    }
                } else if (ch === '*') {
                    start = index;
                    index += 2;
                    blockComment = true;
                    loc = {
                        start: {
                            line: lineNumber,
                            column: index - lineStart - 2
                        }
                    };
                    if (index >= length) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                } else {
                    break;
                }
            } else if (isWhiteSpace(ch)) {
                ++index;
            } else if (isLineTerminator(ch)) {
                ++index;
                if (ch ===  '\r' && source[index] === '\n') {
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
            } else {
                break;
            }
        }
    }

    function filterCommentLocation() {
        var i, entry, comment, comments = [];

        for (i = 0; i < extra.comments.length; ++i) {
            entry = extra.comments[i];
            comment = {
                type: entry.type,
                value: entry.value
            };
            if (extra.range) {
                comment.range = entry.range;
            }
            if (extra.loc) {
                comment.loc = entry.loc;
            }
            comments.push(comment);
        }

        extra.comments = comments;
    }

    function collectToken() {
        var start, loc, token, range, value;

        skipComment();
        start = index;
        loc = {
            start: {
                line: lineNumber,
                column: index - lineStart
            }
        };

        token = extra.advance();
        loc.end = {
            line: lineNumber,
            column: index - lineStart
        };

        if (token.type !== Token.EOF) {
            range = [token.range[0], token.range[1]];
            value = sliceSource(token.range[0], token.range[1]);
            extra.tokens.push({
                type: TokenName[token.type],
                value: value,
                range: range,
                loc: loc
            });
        }

        return token;
    }

    function collectRegex() {
        var pos, loc, regex, token;

        skipComment();

        pos = index;
        loc = {
            start: {
                line: lineNumber,
                column: index - lineStart
            }
        };

        regex = extra.scanRegExp();
        loc.end = {
            line: lineNumber,
            column: index - lineStart
        };

        // Pop the previous token, which is likely '/' or '/='
        if (extra.tokens.length > 0) {
            token = extra.tokens[extra.tokens.length - 1];
            if (token.range[0] === pos && token.type === 'Punctuator') {
                if (token.value === '/' || token.value === '/=') {
                    extra.tokens.pop();
                }
            }
        }

        extra.tokens.push({
            type: 'RegularExpression',
            value: regex.literal,
            range: [pos, index],
            loc: loc
        });

        return regex;
    }

    function filterTokenLocation() {
        var i, entry, token, tokens = [];

        for (i = 0; i < extra.tokens.length; ++i) {
            entry = extra.tokens[i];
            token = {
                type: entry.type,
                value: entry.value
            };
            if (extra.range) {
                token.range = entry.range;
            }
            if (extra.loc) {
                token.loc = entry.loc;
            }
            tokens.push(token);
        }

        extra.tokens = tokens;
    }

    function createLiteral(token) {
        return {
            type: Syntax.Literal,
            value: token.value
        };
    }

    function createRawLiteral(token) {
        return {
            type: Syntax.Literal,
            value: token.value,
            raw: sliceSource(token.range[0], token.range[1])
        };
    }

    function createLocationMarker() {
        var marker = {};

        marker.range = [index, index];
        marker.loc = {
            start: {
                line: lineNumber,
                column: index - lineStart
            },
            end: {
                line: lineNumber,
                column: index - lineStart
            }
        };

        marker.end = function () {
            this.range[1] = index;
            this.loc.end.line = lineNumber;
            this.loc.end.column = index - lineStart;
        };

        marker.applyGroup = function (node) {
            if (extra.range) {
                node.groupRange = [this.range[0], this.range[1]];
            }
            if (extra.loc) {
                node.groupLoc = {
                    start: {
                        line: this.loc.start.line,
                        column: this.loc.start.column
                    },
                    end: {
                        line: this.loc.end.line,
                        column: this.loc.end.column
                    }
                };
            }
        };

        marker.apply = function (node) {
            if (extra.range) {
                node.range = [this.range[0], this.range[1]];
            }
            if (extra.loc) {
                node.loc = {
                    start: {
                        line: this.loc.start.line,
                        column: this.loc.start.column
                    },
                    end: {
                        line: this.loc.end.line,
                        column: this.loc.end.column
                    }
                };
            }
        };

        return marker;
    }

    function trackGroupExpression() {
        var marker, expr;

        skipComment();
        marker = createLocationMarker();
        expect('(');

        expr = parseExpression();

        expect(')');

        marker.end();
        marker.applyGroup(expr);

        return expr;
    }

    function trackLeftHandSideExpression() {
        var marker, expr;

        skipComment();
        marker = createLocationMarker();

        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

        while (match('.') || match('[')) {
            if (match('[')) {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: true,
                    object: expr,
                    property: parseComputedMember()
                };
                marker.end();
                marker.apply(expr);
            } else {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: false,
                    object: expr,
                    property: parseNonComputedMember()
                };
                marker.end();
                marker.apply(expr);
            }
        }

        return expr;
    }

    function trackLeftHandSideExpressionAllowCall() {
        var marker, expr;

        skipComment();
        marker = createLocationMarker();

        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

        while (match('.') || match('[') || match('(')) {
            if (match('(')) {
                expr = {
                    type: Syntax.CallExpression,
                    callee: expr,
                    'arguments': parseArguments()
                };
                marker.end();
                marker.apply(expr);
            } else if (match('[')) {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: true,
                    object: expr,
                    property: parseComputedMember()
                };
                marker.end();
                marker.apply(expr);
            } else {
                expr = {
                    type: Syntax.MemberExpression,
                    computed: false,
                    object: expr,
                    property: parseNonComputedMember()
                };
                marker.end();
                marker.apply(expr);
            }
        }

        return expr;
    }

    function filterGroup(node) {
        var n, i, entry;

        n = (Object.prototype.toString.apply(node) === '[object Array]') ? [] : {};
        for (i in node) {
            if (node.hasOwnProperty(i) && i !== 'groupRange' && i !== 'groupLoc') {
                entry = node[i];
                if (entry === null || typeof entry !== 'object' || entry instanceof RegExp) {
                    n[i] = entry;
                } else {
                    n[i] = filterGroup(entry);
                }
            }
        }
        return n;
    }

    function wrapTrackingFunction(range, loc) {

        return function (parseFunction) {

            function isBinary(node) {
                return node.type === Syntax.LogicalExpression ||
                    node.type === Syntax.BinaryExpression;
            }

            function visit(node) {
                var start, end;

                if (isBinary(node.left)) {
                    visit(node.left);
                }
                if (isBinary(node.right)) {
                    visit(node.right);
                }

                if (range) {
                    if (node.left.groupRange || node.right.groupRange) {
                        start = node.left.groupRange ? node.left.groupRange[0] : node.left.range[0];
                        end = node.right.groupRange ? node.right.groupRange[1] : node.right.range[1];
                        node.range = [start, end];
                    } else if (typeof node.range === 'undefined') {
                        start = node.left.range[0];
                        end = node.right.range[1];
                        node.range = [start, end];
                    }
                }
                if (loc) {
                    if (node.left.groupLoc || node.right.groupLoc) {
                        start = node.left.groupLoc ? node.left.groupLoc.start : node.left.loc.start;
                        end = node.right.groupLoc ? node.right.groupLoc.end : node.right.loc.end;
                        node.loc = {
                            start: start,
                            end: end
                        };
                    } else if (typeof node.loc === 'undefined') {
                        node.loc = {
                            start: node.left.loc.start,
                            end: node.right.loc.end
                        };
                    }
                }
            }

            return function () {
                var marker, node;

                skipComment();

                marker = createLocationMarker();
                node = parseFunction.apply(null, arguments);
                marker.end();

                if (range && typeof node.range === 'undefined') {
                    marker.apply(node);
                }

                if (loc && typeof node.loc === 'undefined') {
                    marker.apply(node);
                }

                if (isBinary(node)) {
                    visit(node);
                }

                return node;
            };
        };
    }

    function patch() {

        var wrapTracking;

        if (extra.comments) {
            extra.skipComment = skipComment;
            skipComment = scanComment;
        }

        if (extra.raw) {
            extra.createLiteral = createLiteral;
            createLiteral = createRawLiteral;
        }

        if (extra.range || extra.loc) {

            extra.parseGroupExpression = parseGroupExpression;
            extra.parseLeftHandSideExpression = parseLeftHandSideExpression;
            extra.parseLeftHandSideExpressionAllowCall = parseLeftHandSideExpressionAllowCall;
            parseGroupExpression = trackGroupExpression;
            parseLeftHandSideExpression = trackLeftHandSideExpression;
            parseLeftHandSideExpressionAllowCall = trackLeftHandSideExpressionAllowCall;

            wrapTracking = wrapTrackingFunction(extra.range, extra.loc);

            extra.parseAdditiveExpression = parseAdditiveExpression;
            extra.parseAssignmentExpression = parseAssignmentExpression;
            extra.parseBitwiseANDExpression = parseBitwiseANDExpression;
            extra.parseBitwiseORExpression = parseBitwiseORExpression;
            extra.parseBitwiseXORExpression = parseBitwiseXORExpression;
            extra.parseBlock = parseBlock;
            extra.parseFunctionSourceElements = parseFunctionSourceElements;
            extra.parseCatchClause = parseCatchClause;
            extra.parseComputedMember = parseComputedMember;
            extra.parseConditionalExpression = parseConditionalExpression;
            extra.parseConstLetDeclaration = parseConstLetDeclaration;
            extra.parseEqualityExpression = parseEqualityExpression;
            extra.parseExpression = parseExpression;
            extra.parseForVariableDeclaration = parseForVariableDeclaration;
            extra.parseFunctionDeclaration = parseFunctionDeclaration;
            extra.parseFunctionExpression = parseFunctionExpression;
            extra.parseLogicalANDExpression = parseLogicalANDExpression;
            extra.parseLogicalORExpression = parseLogicalORExpression;
            extra.parseMultiplicativeExpression = parseMultiplicativeExpression;
            extra.parseNewExpression = parseNewExpression;
            extra.parseNonComputedProperty = parseNonComputedProperty;
            extra.parseObjectProperty = parseObjectProperty;
            extra.parseObjectPropertyKey = parseObjectPropertyKey;
            extra.parsePostfixExpression = parsePostfixExpression;
            extra.parsePrimaryExpression = parsePrimaryExpression;
            extra.parseProgram = parseProgram;
            extra.parsePropertyFunction = parsePropertyFunction;
            extra.parseRelationalExpression = parseRelationalExpression;
            extra.parseStatement = parseStatement;
            extra.parseShiftExpression = parseShiftExpression;
            extra.parseSwitchCase = parseSwitchCase;
            extra.parseUnaryExpression = parseUnaryExpression;
            extra.parseVariableDeclaration = parseVariableDeclaration;
            extra.parseVariableIdentifier = parseVariableIdentifier;

            parseAdditiveExpression = wrapTracking(extra.parseAdditiveExpression);
            parseAssignmentExpression = wrapTracking(extra.parseAssignmentExpression);
            parseBitwiseANDExpression = wrapTracking(extra.parseBitwiseANDExpression);
            parseBitwiseORExpression = wrapTracking(extra.parseBitwiseORExpression);
            parseBitwiseXORExpression = wrapTracking(extra.parseBitwiseXORExpression);
            parseBlock = wrapTracking(extra.parseBlock);
            parseFunctionSourceElements = wrapTracking(extra.parseFunctionSourceElements);
            parseCatchClause = wrapTracking(extra.parseCatchClause);
            parseComputedMember = wrapTracking(extra.parseComputedMember);
            parseConditionalExpression = wrapTracking(extra.parseConditionalExpression);
            parseConstLetDeclaration = wrapTracking(extra.parseConstLetDeclaration);
            parseEqualityExpression = wrapTracking(extra.parseEqualityExpression);
            parseExpression = wrapTracking(extra.parseExpression);
            parseForVariableDeclaration = wrapTracking(extra.parseForVariableDeclaration);
            parseFunctionDeclaration = wrapTracking(extra.parseFunctionDeclaration);
            parseFunctionExpression = wrapTracking(extra.parseFunctionExpression);
            parseLeftHandSideExpression = wrapTracking(parseLeftHandSideExpression);
            parseLogicalANDExpression = wrapTracking(extra.parseLogicalANDExpression);
            parseLogicalORExpression = wrapTracking(extra.parseLogicalORExpression);
            parseMultiplicativeExpression = wrapTracking(extra.parseMultiplicativeExpression);
            parseNewExpression = wrapTracking(extra.parseNewExpression);
            parseNonComputedProperty = wrapTracking(extra.parseNonComputedProperty);
            parseObjectProperty = wrapTracking(extra.parseObjectProperty);
            parseObjectPropertyKey = wrapTracking(extra.parseObjectPropertyKey);
            parsePostfixExpression = wrapTracking(extra.parsePostfixExpression);
            parsePrimaryExpression = wrapTracking(extra.parsePrimaryExpression);
            parseProgram = wrapTracking(extra.parseProgram);
            parsePropertyFunction = wrapTracking(extra.parsePropertyFunction);
            parseRelationalExpression = wrapTracking(extra.parseRelationalExpression);
            parseStatement = wrapTracking(extra.parseStatement);
            parseShiftExpression = wrapTracking(extra.parseShiftExpression);
            parseSwitchCase = wrapTracking(extra.parseSwitchCase);
            parseUnaryExpression = wrapTracking(extra.parseUnaryExpression);
            parseVariableDeclaration = wrapTracking(extra.parseVariableDeclaration);
            parseVariableIdentifier = wrapTracking(extra.parseVariableIdentifier);
        }

        if (typeof extra.tokens !== 'undefined') {
            extra.advance = advance;
            extra.scanRegExp = scanRegExp;

            advance = collectToken;
            scanRegExp = collectRegex;
        }
    }

    function unpatch() {
        if (typeof extra.skipComment === 'function') {
            skipComment = extra.skipComment;
        }

        if (extra.raw) {
            createLiteral = extra.createLiteral;
        }

        if (extra.range || extra.loc) {
            parseAdditiveExpression = extra.parseAdditiveExpression;
            parseAssignmentExpression = extra.parseAssignmentExpression;
            parseBitwiseANDExpression = extra.parseBitwiseANDExpression;
            parseBitwiseORExpression = extra.parseBitwiseORExpression;
            parseBitwiseXORExpression = extra.parseBitwiseXORExpression;
            parseBlock = extra.parseBlock;
            parseFunctionSourceElements = extra.parseFunctionSourceElements;
            parseCatchClause = extra.parseCatchClause;
            parseComputedMember = extra.parseComputedMember;
            parseConditionalExpression = extra.parseConditionalExpression;
            parseConstLetDeclaration = extra.parseConstLetDeclaration;
            parseEqualityExpression = extra.parseEqualityExpression;
            parseExpression = extra.parseExpression;
            parseForVariableDeclaration = extra.parseForVariableDeclaration;
            parseFunctionDeclaration = extra.parseFunctionDeclaration;
            parseFunctionExpression = extra.parseFunctionExpression;
            parseGroupExpression = extra.parseGroupExpression;
            parseLeftHandSideExpression = extra.parseLeftHandSideExpression;
            parseLeftHandSideExpressionAllowCall = extra.parseLeftHandSideExpressionAllowCall;
            parseLogicalANDExpression = extra.parseLogicalANDExpression;
            parseLogicalORExpression = extra.parseLogicalORExpression;
            parseMultiplicativeExpression = extra.parseMultiplicativeExpression;
            parseNewExpression = extra.parseNewExpression;
            parseNonComputedProperty = extra.parseNonComputedProperty;
            parseObjectProperty = extra.parseObjectProperty;
            parseObjectPropertyKey = extra.parseObjectPropertyKey;
            parsePrimaryExpression = extra.parsePrimaryExpression;
            parsePostfixExpression = extra.parsePostfixExpression;
            parseProgram = extra.parseProgram;
            parsePropertyFunction = extra.parsePropertyFunction;
            parseRelationalExpression = extra.parseRelationalExpression;
            parseStatement = extra.parseStatement;
            parseShiftExpression = extra.parseShiftExpression;
            parseSwitchCase = extra.parseSwitchCase;
            parseUnaryExpression = extra.parseUnaryExpression;
            parseVariableDeclaration = extra.parseVariableDeclaration;
            parseVariableIdentifier = extra.parseVariableIdentifier;
        }

        if (typeof extra.scanRegExp === 'function') {
            advance = extra.advance;
            scanRegExp = extra.scanRegExp;
        }
    }

    function stringToArray(str) {
        var length = str.length,
            result = [],
            i;
        for (i = 0; i < length; ++i) {
            result[i] = str.charAt(i);
        }
        return result;
    }

    function parse(code, options) {
        var program, toString;

        toString = String;
        if (typeof code !== 'string' && !(code instanceof String)) {
            code = toString(code);
        }

        source = code;
        index = 0;
        lineNumber = (source.length > 0) ? 1 : 0;
        lineStart = 0;
        length = source.length;
        buffer = null;
        state = {
            allowIn: true,
            labelSet: {},
            inFunctionBody: false,
            inIteration: false,
            inSwitch: false
        };

        extra = {};
        if (typeof options !== 'undefined') {
            extra.range = (typeof options.range === 'boolean') && options.range;
            extra.loc = (typeof options.loc === 'boolean') && options.loc;
            extra.raw = (typeof options.raw === 'boolean') && options.raw;
            if (typeof options.tokens === 'boolean' && options.tokens) {
                extra.tokens = [];
            }
            if (typeof options.comment === 'boolean' && options.comment) {
                extra.comments = [];
            }
            if (typeof options.tolerant === 'boolean' && options.tolerant) {
                extra.errors = [];
            }
        }

        if (length > 0) {
            if (typeof source[0] === 'undefined') {
                // Try first to convert to a string. This is good as fast path
                // for old IE which understands string indexing for string
                // literals only and not for string object.
                if (code instanceof String) {
                    source = code.valueOf();
                }

                // Force accessing the characters via an array.
                if (typeof source[0] === 'undefined') {
                    source = stringToArray(code);
                }
            }
        }

        patch();
        try {
            program = parseProgram();
            if (typeof extra.comments !== 'undefined') {
                filterCommentLocation();
                program.comments = extra.comments;
            }
            if (typeof extra.tokens !== 'undefined') {
                filterTokenLocation();
                program.tokens = extra.tokens;
            }
            if (typeof extra.errors !== 'undefined') {
                program.errors = extra.errors;
            }
            if (extra.range || extra.loc) {
                program.body = filterGroup(program.body);
            }
        } catch (e) {
            throw e;
        } finally {
            unpatch();
            extra = {};
        }

        return program;
    }

    // Sync with package.json.
    exports.version = '1.0.4';

    exports.parse = parse;

    // Deep copy.
    exports.Syntax = (function () {
        var name, types = {};

        if (typeof Object.create === 'function') {
            types = Object.create(null);
        }

        for (name in Syntax) {
            if (Syntax.hasOwnProperty(name)) {
                types[name] = Syntax[name];
            }
        }

        if (typeof Object.freeze === 'function') {
            Object.freeze(types);
        }

        return types;
    }());

}));
/* vim: set sw=4 ts=4 et tw=80 : */

},{}],23:[function(require,module,exports){
var parse = require('esprima').parse;
var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};
var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn);
    for (var i = 0; i < xs.length; i++) {
        fn.call(xs, xs[i], i, xs);
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

module.exports = function (src, opts, fn) {
    if (typeof opts === 'function') {
        fn = opts;
        opts = {};
    }
    if (typeof src === 'object') {
        opts = src;
        src = opts.source;
        delete opts.source;
    }
    src = src === undefined ? opts.source : src;
    opts.range = true;
    if (typeof src !== 'string') src = String(src);
    
    var ast = parse(src, opts);
    
    var result = {
        chunks : src.split(''),
        toString : function () { return result.chunks.join('') },
        inspect : function () { return result.toString() }
    };
    var index = 0;
    
    (function walk (node, parent) {
        insertHelpers(node, parent, result.chunks);
        
        forEach(objectKeys(node), function (key) {
            if (key === 'parent') return;
            
            var child = node[key];
            if (isArray(child)) {
                forEach(child, function (c) {
                    if (c && typeof c.type === 'string') {
                        walk(c, node);
                    }
                });
            }
            else if (child && typeof child.type === 'string') {
                insertHelpers(child, node, result.chunks);
                walk(child, node);
            }
        });
        fn(node);
    })(ast, undefined);
    
    return result;
};
 
function insertHelpers (node, parent, chunks) {
    if (!node.range) return;
    
    node.parent = parent;
    
    node.source = function () {
        return chunks.slice(
            node.range[0], node.range[1]
        ).join('');
    };
    
    if (node.update && typeof node.update === 'object') {
        var prev = node.update;
        forEach(objectKeys(prev), function (key) {
            update[key] = prev[key];
        });
        node.update = update;
    }
    else {
        node.update = update;
    }
    
    function update (s) {
        chunks[node.range[0]] = s;
        for (var i = node.range[0] + 1; i < node.range[1]; i++) {
            chunks[i] = '';
        }
    };
}

},{"esprima":22}],24:[function(require,module,exports){
var coords = require('notecoord');
var accval = require('accidental-value');

module.exports = function helmholtz(name) {
  var name = name.replace(/\u2032/g, "'").replace(/\u0375/g, ',');
  var parts = name.match(/^(,*)([a-h])(x|#|bb|b?)([,\']*)$/i);

  if (!parts || name !== parts[0])
    throw new Error('Invalid formatting');

  var note = parts[2];
  var octaveFirst = parts[1];
  var octaveLast = parts[4];
  var lower = note === note.toLowerCase();
  var octave;

  if (octaveFirst) {
    if (lower)
      throw new Error('Invalid formatting - found commas before lowercase note');

    octave = 2 - octaveFirst.length;
  } else if (octaveLast) {
    if (octaveLast.match(/^'+$/) && lower)
      octave = 3 + octaveLast.length;
    else if (octaveLast.match(/^,+$/) && !lower)
      octave = 2 - octaveLast.length;
    else
      throw new Error('Invalid formatting - mismatch between octave ' +
        'indicator and letter case')
  } else
    octave = lower ? 3 : 2;

  var accidentalValue = accval.interval(parts[3].toLowerCase());
  var coord = coords(note.toLowerCase());

  coord[0] += octave;
  coord[0] += accidentalValue[0] - coords.A4[0];
  coord[1] += accidentalValue[1] - coords.A4[1];

  return coord;
};

},{"accidental-value":14,"notecoord":32}],25:[function(require,module,exports){
var pattern = /^(AA|A|P|M|m|d|dd)(-?\d+)$/;

// The interval it takes to raise a note a semitone
var sharp = [-4, 7];

var pAlts = ['dd', 'd', 'P', 'A', 'AA'];
var mAlts = ['dd', 'd', 'm', 'M', 'A', 'AA'];

var baseIntervals = [
  [0, 0],
  [3, -5],
  [2, -3],
  [1, -1],
  [0, 1],
  [3, -4],
  [2, -2],
  [1, 0]
];

module.exports = function(simple) {
  var parser = simple.match(pattern);
  if (!parser) return null;

  var quality = parser[1];
  var number = +parser[2];
  var sign = number < 0 ? -1 : 1;

  number = sign < 0 ? -number : number;

  var lower = number > 8 ? (number % 7 || 7) : number;
  var octaves = (number - lower) / 7;

  var base = baseIntervals[lower - 1];
  var alts = base[0] <= 1 ? pAlts : mAlts;
  var alt = alts.indexOf(quality) - 2;

  // this happens, if the alteration wasn't suitable for this type
  // of interval, such as P2 or M5 (no "perfect second" or "major fifth")
  if (alt === -3) return null;

  return [
    sign * (base[0] + octaves + sharp[0] * alt),
    sign * (base[1] + sharp[1] * alt)
  ];
}

// Copy to avoid overwriting internal base intervals
module.exports.coords = baseIntervals.slice(0);

},{}],26:[function(require,module,exports){
"use strict"

var ops = require("ndarray-ops")
var cwise = require("cwise")
var ndarray = require("ndarray")
var fftm = require("./lib/fft-matrix.js")
var pool = require("typedarray-pool")

function ndfft(dir, x, y) {
  var shape = x.shape
    , d = shape.length
    , size = 1
    , stride = new Array(d)
    , pad = 0
    , i, j
  for(i=d-1; i>=0; --i) {
    stride[i] = size
    size *= shape[i]
    pad = Math.max(pad, fftm.scratchMemory(shape[i]))
    if(x.shape[i] !== y.shape[i]) {
      throw new Error("Shape mismatch, real and imaginary arrays must have same size")
    }
  }
  var buffer = pool.malloc(4 * size + pad, "double")
  var x1 = ndarray(buffer, shape.slice(0), stride, 0)
    , y1 = ndarray(buffer, shape.slice(0), stride.slice(0), size)
    , x2 = ndarray(buffer, shape.slice(0), stride.slice(0), 2*size)
    , y2 = ndarray(buffer, shape.slice(0), stride.slice(0), 3*size)
    , tmp, n, s1, s2
    , scratch_ptr = 4 * size
  
  //Copy into x1/y1
  ops.assign(x1, x)
  ops.assign(y1, y)
  
  for(i=d-1; i>=0; --i) {
    fftm(dir, size/shape[i], shape[i], buffer, x1.offset, y1.offset, scratch_ptr)
    if(i === 0) {
      break
    }
    
    //Compute new stride for x2/y2
    n = 1
    s1 = x2.stride
    s2 = y2.stride
    for(j=i-1; j<d; ++j) {
      s2[j] = s1[j] = n
      n *= shape[j]
    }
    for(j=i-2; j>=0; --j) {
      s2[j] = s1[j] = n
      n *= shape[j]
    }
    
    //Transpose
    ops.assign(x2, x1)
    ops.assign(y2, y1)
    
    //Swap buffers
    tmp = x1
    x1 = x2
    x2 = tmp
    tmp = y1
    y1 = y2
    y2 = tmp
  }
  
  //Copy result back into x
  ops.assign(x, x1)
  ops.assign(y, y1)
  
  pool.free(buffer)
}

module.exports = ndfft

},{"./lib/fft-matrix.js":27,"cwise":16,"ndarray":29,"ndarray-ops":28,"typedarray-pool":44}],27:[function(require,module,exports){
var bits = require("bit-twiddle")

function fft(dir, nrows, ncols, buffer, x_ptr, y_ptr, scratch_ptr) {
  dir |= 0
  nrows |= 0
  ncols |= 0
  x_ptr |= 0
  y_ptr |= 0
  if(bits.isPow2(ncols)) {
    fftRadix2(dir, nrows, ncols, buffer, x_ptr, y_ptr)
  } else {
    fftBluestein(dir, nrows, ncols, buffer, x_ptr, y_ptr, scratch_ptr)
  }
}
module.exports = fft

function scratchMemory(n) {
  if(bits.isPow2(n)) {
    return 0
  }
  return 2 * n + 4 * bits.nextPow2(2*n + 1)
}
module.exports.scratchMemory = scratchMemory


//Radix 2 FFT Adapted from Paul Bourke's C Implementation
function fftRadix2(dir, nrows, ncols, buffer, x_ptr, y_ptr) {
  dir |= 0
  nrows |= 0
  ncols |= 0
  x_ptr |= 0
  y_ptr |= 0
  var nn,i,i1,j,k,i2,l,l1,l2
  var c1,c2,t,t1,t2,u1,u2,z,row,a,b,c,d,k1,k2,k3
  
  // Calculate the number of points
  nn = ncols
  m = bits.log2(nn)
  
  for(row=0; row<nrows; ++row) {  
    // Do the bit reversal
    i2 = nn >> 1;
    j = 0;
    for(i=0;i<nn-1;i++) {
      if(i < j) {
        t = buffer[x_ptr+i]
        buffer[x_ptr+i] = buffer[x_ptr+j]
        buffer[x_ptr+j] = t
        t = buffer[y_ptr+i]
        buffer[y_ptr+i] = buffer[y_ptr+j]
        buffer[y_ptr+j] = t
      }
      k = i2
      while(k <= j) {
        j -= k
        k >>= 1
      }
      j += k
    }
    
    // Compute the FFT
    c1 = -1.0
    c2 = 0.0
    l2 = 1
    for(l=0;l<m;l++) {
      l1 = l2
      l2 <<= 1
      u1 = 1.0
      u2 = 0.0
      for(j=0;j<l1;j++) {
        for(i=j;i<nn;i+=l2) {
          i1 = i + l1
          a = buffer[x_ptr+i1]
          b = buffer[y_ptr+i1]
          c = buffer[x_ptr+i]
          d = buffer[y_ptr+i]
          k1 = u1 * (a + b)
          k2 = a * (u2 - u1)
          k3 = b * (u1 + u2)
          t1 = k1 - k3
          t2 = k1 + k2
          buffer[x_ptr+i1] = c - t1
          buffer[y_ptr+i1] = d - t2
          buffer[x_ptr+i] += t1
          buffer[y_ptr+i] += t2
        }
        k1 = c1 * (u1 + u2)
        k2 = u1 * (c2 - c1)
        k3 = u2 * (c1 + c2)
        u1 = k1 - k3
        u2 = k1 + k2
      }
      c2 = Math.sqrt((1.0 - c1) / 2.0)
      if(dir < 0) {
        c2 = -c2
      }
      c1 = Math.sqrt((1.0 + c1) / 2.0)
    }
    
    // Scaling for inverse transform
    if(dir < 0) {
      var scale_f = 1.0 / nn
      for(i=0;i<nn;i++) {
        buffer[x_ptr+i] *= scale_f
        buffer[y_ptr+i] *= scale_f
      }
    }
    
    // Advance pointers
    x_ptr += ncols
    y_ptr += ncols
  }
}

// Use Bluestein algorithm for npot FFTs
// Scratch memory required:  2 * ncols + 4 * bits.nextPow2(2*ncols + 1)
function fftBluestein(dir, nrows, ncols, buffer, x_ptr, y_ptr, scratch_ptr) {
  dir |= 0
  nrows |= 0
  ncols |= 0
  x_ptr |= 0
  y_ptr |= 0
  scratch_ptr |= 0

  // Initialize tables
  var m = bits.nextPow2(2 * ncols + 1)
    , cos_ptr = scratch_ptr
    , sin_ptr = cos_ptr + ncols
    , xs_ptr  = sin_ptr + ncols
    , ys_ptr  = xs_ptr  + m
    , cft_ptr = ys_ptr  + m
    , sft_ptr = cft_ptr + m
    , w = -dir * Math.PI / ncols
    , row, a, b, c, d, k1, k2, k3
    , i
  for(i=0; i<ncols; ++i) {
    a = w * ((i * i) % (ncols * 2))
    c = Math.cos(a)
    d = Math.sin(a)
    buffer[cft_ptr+(m-i)] = buffer[cft_ptr+i] = buffer[cos_ptr+i] = c
    buffer[sft_ptr+(m-i)] = buffer[sft_ptr+i] = buffer[sin_ptr+i] = d
  }
  for(i=ncols; i<=m-ncols; ++i) {
    buffer[cft_ptr+i] = 0.0
  }
  for(i=ncols; i<=m-ncols; ++i) {
    buffer[sft_ptr+i] = 0.0
  }

  fftRadix2(1, 1, m, buffer, cft_ptr, sft_ptr)
  
  //Compute scale factor
  if(dir < 0) {
    w = 1.0 / ncols
  } else {
    w = 1.0
  }
  
  //Handle direction
  for(row=0; row<nrows; ++row) {
  
    // Copy row into scratch memory, multiply weights
    for(i=0; i<ncols; ++i) {
      a = buffer[x_ptr+i]
      b = buffer[y_ptr+i]
      c = buffer[cos_ptr+i]
      d = -buffer[sin_ptr+i]
      k1 = c * (a + b)
      k2 = a * (d - c)
      k3 = b * (c + d)
      buffer[xs_ptr+i] = k1 - k3
      buffer[ys_ptr+i] = k1 + k2
    }
    //Zero out the rest
    for(i=ncols; i<m; ++i) {
      buffer[xs_ptr+i] = 0.0
    }
    for(i=ncols; i<m; ++i) {
      buffer[ys_ptr+i] = 0.0
    }
    
    // FFT buffer
    fftRadix2(1, 1, m, buffer, xs_ptr, ys_ptr)
    
    // Apply multiplier
    for(i=0; i<m; ++i) {
      a = buffer[xs_ptr+i]
      b = buffer[ys_ptr+i]
      c = buffer[cft_ptr+i]
      d = buffer[sft_ptr+i]
      k1 = c * (a + b)
      k2 = a * (d - c)
      k3 = b * (c + d)
      buffer[xs_ptr+i] = k1 - k3
      buffer[ys_ptr+i] = k1 + k2
    }
    
    // Inverse FFT buffer
    fftRadix2(-1, 1, m, buffer, xs_ptr, ys_ptr)
    
    // Copy result back into x/y
    for(i=0; i<ncols; ++i) {
      a = buffer[xs_ptr+i]
      b = buffer[ys_ptr+i]
      c = buffer[cos_ptr+i]
      d = -buffer[sin_ptr+i]
      k1 = c * (a + b)
      k2 = a * (d - c)
      k3 = b * (c + d)
      buffer[x_ptr+i] = w * (k1 - k3)
      buffer[y_ptr+i] = w * (k1 + k2)
    }
    
    x_ptr += ncols
    y_ptr += ncols
  }
}

},{"bit-twiddle":15}],28:[function(require,module,exports){
var cwise = require("cwise")
var ndarray = require("ndarray")

var assign_ops = {
  add:  "+",
  sub:  "-",
  mul:  "*",
  div:  "/",
  mod:  "%",
  band: "&",
  bor:  "|",
  bxor: "^",
  lshift: "<<",
  rshift: ">>",
  rrshift: ">>>"
};

(function(){
  for(var id in assign_ops) {
    var op = assign_ops[id]
    exports[id] = cwise({
      args: ["array","array","array"],
      body: Function("a","b","c","a=b"+op+"c")
    })
    exports[id+"eq"] = cwise({
      args: ["array","array"],
      body: Function("a","b","a"+op+"=b")
    })
    exports[id+"s"] = cwise({
      args: ["array", "array", "scalar"],
      body: Function("a","b","s","a=b"+op+"s")
    })
    exports[id+"seq"] = cwise({
      args: ["array","scalar"],
      body: Function("a","s","a"+op+"=s")
    })
  }
})()

var unary_ops = {
  not: "!",
  bnot: "~",
  neg: "-",
  recip: "1.0/"
};

(function(){
  for(var id in unary_ops) {
    var op = unary_ops[id]
    exports[id] = cwise({
      args: ["array", "array"],
      body: Function("a","b","a="+op+"b")
    })
    exports[id+"eq"] = cwise({
      args: ["array"],
      body: Function("a","a="+op+"a")
    })
  }
})()

var binary_ops = {
  and: "&&",
  or: "||",
  eq: "===",
  neq: "!==",
  lt: "<",
  gt: ">",
  leq: "<=",
  geq: ">="
};

(function() {
  for(var id in binary_ops) {
    var op = binary_ops[id]
    exports[id] = cwise({
      args: ["array","array","array"],
      body: Function("a", "b", "c", "a=b"+op+"c")
    })
    exports[id+"s"] = cwise({
      args: ["array","array","scalar"],
      body: Function("a", "b", "s", "a=b"+op+"s")
    })
    exports[id+"eq"] = cwise({
      args: ["array", "array"],
      body: Function("a", "b", "a=a"+op+"b")
    })
    exports[id+"seq"] = cwise({
      args: ["array", "scalar"],
      body: Function("a", "s", "a=a"+op+"s")
    })
  }
})()

var math_unary = [
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "exp",
  "floor",
  "log",
  "round",
  "sin",
  "sqrt",
  "tan"
];

(function() {
  for(var i=0; i<math_unary.length; ++i) {
    var f = math_unary[i]
    exports[f] = cwise({
                    args: ["array", "array"],
                    pre: Function("this.func=Math."+f),
                    body: function(a,b) {
                      a = this.func(b)
                    }
                  })
    exports[f+"eq"] = cwise({
                      args: ["array"],
                      pre: Function("this.func=Math."+f),
                      body: function(a) {
                        a = this.func(a)
                      }
                    })
  }
})()

var math_comm = [
  "max",
  "min"
];
(function(){
  for(var i=0; i<math_comm.length; ++i) {
    var f= math_comm[i]
 
    exports[f] = cwise({
                  args:["array", "array", "array"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b,c) {
                    a = this.func(b,c)
                  }
                })
    exports[f+"s"] = cwise({
                  args:["array", "array", "scalar"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b,c) {
                    a = this.func(b,c)
                  }})
    exports[f+"eq"] = cwise({ args:["array", "array"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b) {
                    a = this.func(a,b)
                  }})
 
    exports[f+"seq"] = cwise({ args:["array", "scalar"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b) {
                    a = this.func(a,b)
                  }})
  }
})()

var math_noncomm = [
  "atan2",
  "pow"
];

(function(){
  for(var i=0; i<math_noncomm.length; ++i) {
    var f= math_noncomm[i]
    exports[f] = cwise({ args:["array", "array", "array"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b,c) {
                    a = this.func(b,c)
                  }})
                  
    exports[f+"s"] = cwise({ args:["array", "array", "scalar"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b,c) {
                    a = this.func(b,c)
                  }})
                  
    exports[f+"eq"] = cwise({ args:["array", "array"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b) {
                    a = this.func(a,b)
                  }})
                  
    exports[f+"seq"] = cwise({ args:["array", "scalar"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b) {
                    a = this.func(a,b)
                  }})
                  
    exports[f+"op"] = cwise({ args:["array", "array", "array"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b,c) {
                    a = this.func(c,b)
                  }})
                  
    exports[f+"ops"] = cwise({ args:["array", "array", "scalar"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b,c) {
                    a = this.func(c,b)
                  }})
                  
    exports[f+"opeq"] = cwise({ args:["array", "array"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b) {
                    a = this.func(b,a)
                  }})
                  
    exports[f+"opseq"] = cwise({ args:["array", "scalar"],
                  pre: Function("this.func=Math."+f),
                  body: function(a,b) {
                    a = this.func(b,a)
                  }})
                  
  }
})()

exports.any = cwise({ args:["array"],
  body: function(a) {
    if(a) {
      return true
    }
  },
  post: function() {
    return false
  }})
  

exports.all = cwise({ args:["array"],
  body: function(a) {
    if(!a) {
      return false
    }
  },
  post: function() {
    return true
  }})
  

exports.sum = cwise({ args:["array"],
  pre: function() {
    this.sum = 0
  },
  body: function(a) {
    this.sum += a
  },
  post: function() {
    return this.sum
  }})
  

exports.prod = cwise({ args:["array"],
  pre: function() {
    this.prod = 1
  },
  body: function(a) {
    this.prod *= a
  },
  post: function() {
    return this.prod
  }})
  

exports.norm2squared = cwise({ args:["array"],
  pre: function() {
    this.sum = 0
  },
  body: function(a) {
    this.sum += a*a
  },
  post: function() {
    return this.sum
  }})
  


exports.norm2 = cwise({ args:["array"],
  pre: function() {
    this.sum = 0
  },
  body: function(a) {
    this.sum += a*a
  },
  post: function() {
    return Math.sqrt(this.sum)
  }})
  

exports.norminf = cwise({ args:["array"],
  pre: function() {
    this.n = 0
  },
  body: function(a) {
    if(a<0){
      if(-a<this.n){
        this.n=-a
      }
    } else if(a>this.n){
      s=a
    }
  },
  post: function() {
    return this.n
  }})
  

exports.norm1 = cwise({ args:["array"],
  pre: function() {
    this.sum = 0
  },
  body: function(a) {
    this.sum += a < 0 ? -a : a
  },
  post: function() {
    return this.sum
  }})


exports.sup = cwise({ args:["array"],
  pre: function() {
    this.hi = Number.NEGATIVE_INFINITY
  },
  body: function(a) {
    if(a > this.hi) {
      this.hi = a
    }
  },
  post: function() {
    return this.hi
  }})
  

exports.inf = cwise({ args:["array"],
  pre: function() {
    this.lo = Number.POSITIVE_INFINITY
  },
  body: function(a) {
    if(a < this.lo) {
      this.lo = a
    }
  },
  post: function() {
    return this.lo
  }})
  

exports.argmin = cwise({ args:["index", "array"],
  pre: function(i) {
    this.min_v = Number.POSITIVE_INFINITY
    this.min_i = i.slice(0)
  },
  body: function(i, a) {
    if(a < this.min_v) {
      this.min_v = a
      for(var k=0; k<i.length; ++k) {
        this.min_i[k] = i[k]
      }
    }
  },
  post: function() {
    return this.min_i
  }})
  

exports.argmax = cwise({ args:["index", "array"],
  pre: function(i) {
    this.max_v = Number.NEGATIVE_INFINITY
    this.max_i = i.slice(0)
  },
  body: function(i, a) {
    if(a > this.max_v) {
      this.max_v = a
      for(var k=0; k<i.length; ++k) {
        this.max_i[k] = i[k]
      }
    }
  },
  post: function() {
    return this.max_i
  }})
  

exports.random = cwise({ args:["array"],
  pre: function() {
    this.rnd = Math.random
  },
  body: function(a) {
    a = this.rnd()
  }})
  

exports.assign = cwise({ args:["array", "array"],
  body: function(a,b) {
    a = b
  }})

exports.assigns = cwise({ args:["array", "scalar"],
  body: function(a,b) {
    a = b
  }})

exports.clone = function(array) {
  var stride = new Array(array.shape.length)
  var tsz = 1;
  for(var i=array.shape.length-1; i>=0; --i) {
    stride[i] = tsz
    tsz *= array.shape[i]
  }
  var ndata = new array.data.constructor(array.data.slice(0, tsz*array.data.BYTES_PER_ELEMENT))
  var result = ndarray(ndata, array.shape.slice(0), stride, 0)
  return exports.assign(result, array)
}

},{"cwise":16,"ndarray":29}],29:[function(require,module,exports){
"use strict"

var tools = require("./lib/tools.js")
var makeView = require("./lib/viewn.js")

function arrayDType(data) {
  if(data instanceof Float64Array) {
    return "float64";
  } else if(data instanceof Float32Array) {
    return "float32"
  } else if(data instanceof Int32Array) {
    return "int32"
  } else if(data instanceof Uint32Array) {
    return "uint32"
  } else if(data instanceof Uint8Array) {
    return "uint8"
  } else if(data instanceof Uint16Array) {
    return "uint16"
  } else if(data instanceof Int16Array) {
    return "int16"
  } else if(data instanceof Int8Array) {
    return "int8"
  }
  return null
}

function eor(shape, stride, offset) {
  for(var i=0; i<shape.length; ++i) {
    if(shape[i] === 0) {
      return 0
    }
    offset += (shape[i]-1) * stride[i]
  }
  return offset
}

//Wraps a typed array as an ndarray
function wrap(tarray, shape, stride, offset) {
  if(!arrayDType(tarray)) {
    throw new Error("Input is not a typed array")
  }
  if(!shape) {
    shape = [ tarray.length ]
  } else {
    var tsz = 1
    for(var i=0; i<shape.length; ++i) {
      tsz *= shape[i]
    }
    if(tsz > tarray.length) {
      throw new Error("Array shape out of bounds")
    }
  }
  if(!stride) {
    stride = new Array(shape.length)
    var sz = 1
    for(var i=shape.length-1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  } else if(stride.length !== shape.length) {
    throw new Error("Bad stride length")
  }
  if(!offset) {
    offset = 0
  }
  if(tarray.length > 0) {
    if(offset < 0 || offset >= tarray.length) {
      throw new Error("Offset out of range")
    }
    var e = eor(shape, stride, offset)
    if(e < 0 || e >= tarray.length) {
      throw new Error("Array shape out of bounds")
    }
  } else {
    offset = 0
  }
  return makeView(tarray, shape, stride, offset)
}

function dtype(view) {
  return arrayDType(view.data)
}

function zeros(shape, dtype, order) {
  if(!dtype) {
    dtype = "float64"
  }
  //Default row-major order
  if(!order) {
    order = new Array(shape.length)
    for(var i=shape.length-1, j=0; i>=0; --i, ++j) {
      order[j] = i
    }
  }
  var stride =  new Array(shape.length)
  var size = 1
  for(var i=0; i<shape.length; ++i) {
    stride[order[i]] = size
    size *= shape[order[i]]
  }
  var buf
  switch(dtype) {
    case "int8":
      buf = new Int8Array(size)
    break
    case "int16":
      buf = new Int16Array(size)
    break
    case "int32":
      buf = new Int32Array(size)
    break
    case "uint8":
      buf = new Uint8Array(size)
    break
    case "uint16":
      buf = new Uint16Array(size)
    break
    case "uint32":
      buf = new Uint32Array(size)
    break
    case "float32":
      buf = new Float32Array(size)
    break
    case "float64":
      buf = new Float64Array(size)
    break
    default:
      throw new Error("Invalid data type")
    break
  }
  return makeView(buf, shape, stride, 0)
}

function order(view) {
  return tools.order(view.stride)
}

function size(view) {
  var shape = view.shape
    , d = shape.length
    , r = 1, i
  if(d === 0) {
    return 0
  }
  for(i=0; i<d; ++i) {
    r *= shape[i]
  }
  return r
}

function pstride(shape, order) {
  var i = 0, d = shape.length
  var result = new Array(d), s = 1
  if(order) {
    for(i=0; i<d; ++i) {
      result[order[i]] = s
      s *= shape[order[i]]
    }
  } else {
    for(var i=d-1; i>=0; --i) {
      stride[i] = s
      s *= shape[i]
    }
  }
  return result
}

module.exports = wrap
module.exports.zeros    = zeros
module.exports.dtype    = dtype
module.exports.order    = order
module.exports.size     = size
module.exports.stride   = pstride
module.exports.ctor     = makeView
},{"./lib/tools.js":30,"./lib/viewn.js":31}],30:[function(require,module,exports){

function compare1st(a, b) {
  return a[0] - b[0];
}

function order(stride) {
  var terms = new Array(stride.length);
  for(var i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i];
  }
  terms.sort(compare1st);
  var result = new Array(terms.length);
  for(var i=0; i<result.length; ++i) {
    result[i] = terms[i][1];
  }
  return result;
}

exports.order = order;


},{}],31:[function(require,module,exports){
"use strict"

var tools = require("./tools.js")

var RECURSION_LIMIT = 32

function ViewN(data, shape, stride, offset) {
  this.data = data
  this.shape = shape
  this.stride = stride
  this.offset = offset
}

ViewN.prototype.get = function() {
  var ptr = this.offset
  for(var i=0; i<this.shape.length; ++i) {
    ptr += arguments[i] * this.stride[i]
  }
  return this.data[ptr]
}
ViewN.prototype.set = function() {
  var ptr = this.offset
  for(var i=0; i<this.shape.length; ++i) {
    ptr += arguments[i] * this.stride[i]
  }
  var v = arguments[this.shape.length]
  this.data[ptr] = v
  return v
}
ViewN.prototype.lo = function() {
  var nshape = this.shape.slice(0)
  var nstride = this.stride.slice(0)
  var noffset = this.offset
  for(var i=0; i<nshape.length; ++i) {
    var x = arguments[i]
    if(typeof x === "number") {
      x |= 0
      if(x < 0) {
        x = nshape[i] + x
      }
      noffset += x * nstride[i]
      nshape[i] -= x
    }
  }
  return new this.constructor(this.data, nshape, nstride, noffset)
}
ViewN.prototype.hi = function() {
  var nshape = new Array(this.shape.length)
  for(var i=0; i<nshape.length; ++i) {
    var x = arguments[i]
    if(typeof x === "number") {
      x |= 0
      if(x < 0) {
        x = this.shape[i] + x
      }
      nshape[i] = x
    } else {
      nshape[i] = this.shape[i]
    }
  }
  return new this.constructor(this.data, nshape, this.stride.slice(0), this.offset)
}
ViewN.prototype.step = function() {
  var nshape = this.shape.slice(0)
  var nstride = this.stride.slice(0)
  var noffset = this.offset
  for(var i=0; i<nshape.length; ++i) {
    var s = arguments[i]
    nstride[i] *= s
    if(s < 0) {
      noffset += this.stride[i] * (this.shape[i] - 1)
      nshape[i] = Math.ceil(-this.shape[i] / s)
    } else if(s > 0) {
      nshape[i] = Math.ceil(this.shape[i] / s)
    }
  }
  return new this.constructor(this.data, nshape, nstride, noffset)
}
ViewN.prototype.transpose = function() {
  var nshape = this.shape.slice(0)
  var nstride = this.stride.slice(0)
  var noffset = this.offset
  for(var i=0; i<nshape.length; ++i) {
    var ord = arguments[i]
    nshape[i] = this.shape[ord]
    nstride[i] = this.stride[ord]
  }
  return new this.constructor(this.data, nshape, nstride, noffset)
}
ViewN.prototype.pick = function() {
  var nshape = []
  var nstride = []
  var noffset = this.offset
  for(var i=0; i<this.shape.length; ++i) {
    if(arguments[i] >= 0) {
      noffset += this.stride[i] * arguments[i]
    } else {
      nshape.push(this.shape[i])
      nstride.push(this.stride[i])
    }
  }
  return CTOR(this.data, nshape, nstride, noffset)
}

ViewN.prototype.toString = function() {
  var buffer = []
  var index = new Array(this.shape.length)
  for(var i=0; i<index.length; ++i) {
    index[i] = 0
  }
  var ptr = this.offset
  while(true) {
    for(var i=index.length-1; i>=0; --i) {
      if(index[i] === 0) {
        buffer.push("[")
      } else {
        break
      }
    }
    var i = this.shape.length-1
    buffer.push(this.data[ptr])
    while(i>=0) {
      ptr += this.stride[i]
      ++index[i]
      if(index[i] >= this.shape[i]) {
        buffer.push("]")
        if(i === 0) {
          return buffer.join("")
        }
        ptr -= this.stride[i] * this.shape[i]
        index[i--] = 0
      } else {
        buffer.push(",")
        break
      }
    }
  }
}

function View0(data) {
  this.data = data
  this.shape = []
  this.stride = []
  this.offset = 0
}
View0.prototype.get =
View0.prototype.set = function() {
  return Number.NaN
}
View0.prototype.lo =
View0.prototype.hi =
View0.prototype.step =
View0.prototype.transpose =
View0.prototype.pick = function() {
  return new View0(this.data)
}
View0.prototype.toString = function() {
  return "[]"
}


function View1(data, shape, stride, offset) {
  this.data = data
  this.shape = shape
  this.stride = stride
  this.offset = offset
}
View1.prototype.get = function(i) {
  return this.data[i * this.stride[0] + this.offset]
}
View1.prototype.set = function(i, v) {
  this.data[i * this.stride[0] + this.offset] = v
  return v
}
View1.prototype.lo = ViewN.prototype.lo
View1.prototype.hi = ViewN.prototype.hi
View1.prototype.step = ViewN.prototype.step
View1.prototype.transpose = ViewN.prototype.transpose
View1.prototype.pick = ViewN.prototype.pick
View1.prototype.toString = ViewN.prototype.toString


function View2(data, shape, stride, offset) {
  this.data = data
  this.shape = shape
  this.stride = stride
  this.offset = offset
}
View2.prototype.get = function(i, j) {
  return this.data[this.offset + i * this.stride[0] + j * this.stride[1]]
}
View2.prototype.set = function(i, j, v) {
  return this.data[this.offset + i * this.stride[0] + j * this.stride[1]] = v
}
View2.prototype.hi = ViewN.prototype.hi
View2.prototype.lo = ViewN.prototype.lo
View2.prototype.step = ViewN.prototype.step
View2.prototype.transpose = ViewN.prototype.transpose
View2.prototype.pick = ViewN.prototype.pick
View2.prototype.toString = ViewN.prototype.toString


function View3(data, shape, stride, offset) {
  this.data = data
  this.shape = shape
  this.stride = stride
  this.offset = offset
}
View3.prototype.get = function(i, j, k) {
  return this.data[this.offset + i * this.stride[0] + j * this.stride[1] + k * this.stride[2]]
}
View3.prototype.set = function(i, j, k, v) {
  return this.data[this.offset + i * this.stride[0] + j * this.stride[1] + k * this.stride[2]] = v
}
View3.prototype.hi = ViewN.prototype.hi
View3.prototype.lo = ViewN.prototype.lo
View3.prototype.step = ViewN.prototype.step
View3.prototype.transpose = ViewN.prototype.transpose
View3.prototype.pick = ViewN.prototype.pick
View3.prototype.toString = ViewN.prototype.toString


function CTOR(data, shape, stride, offset) {
  switch(shape.length) {
    case 0:   return new View0(data)
    case 1:   return new View1(data, shape, stride, offset)
    case 2:   return new View2(data, shape, stride, offset)
    case 3:   return new View3(data, shape, stride, offset)
    default:  return new ViewN(data, shape, stride, offset)
  }
}

module.exports = CTOR

},{"./tools.js":30}],32:[function(require,module,exports){
// First coord is octaves, second is fifths. Distances are relative to c
var notes = {
  c: [0, 0],
  d: [-1, 2],
  e: [-2, 4],
  f: [1, -1],
  g: [0, 1],
  a: [-1, 3],
  b: [-2, 5],
  h: [-2, 5]
};

module.exports = function(name) {
  return name in notes ? [notes[name][0], notes[name][1]] : null;
};

module.exports.notes = notes;
module.exports.A4 = [3, 3]; // Relative to C0 (scientic notation, ~16.35Hz)
module.exports.sharp = [-4, 7];

},{}],33:[function(require,module,exports){
module.exports = function(coord, stdPitch) {
  if (typeof coord === 'number') {
    stdPitch = coord;
    return function(coord) {
      return stdPitch * Math.pow(2, (coord[0] * 12 + coord[1] * 7) / 12);
    }
  }

  stdPitch = stdPitch || 440;
  return stdPitch * Math.pow(2, (coord[0] * 12 + coord[1] * 7) / 12);
}

},{}],34:[function(require,module,exports){
var coords = require('notecoord');
var accval = require('accidental-value');

module.exports = function scientific(name) {
  var format = /^([a-h])(x|#|bb|b?)(-?\d*)/i;

  var parser = name.match(format);
  if (!(parser && name === parser[0] && parser[3].length)) return;

  var noteName = parser[1];
  var octave = +parser[3];
  var accidental = parser[2].length ? parser[2].toLowerCase() : '';

  var accidentalValue = accval.interval(accidental);
  var coord = coords(noteName.toLowerCase());

  coord[0] += octave;
  coord[0] += accidentalValue[0] - coords.A4[0];
  coord[1] += accidentalValue[1] - coords.A4[1];

  return coord;
};

},{"accidental-value":14,"notecoord":32}],35:[function(require,module,exports){
"use strict"

var ndarray = require("ndarray")
var fft = require("ndarray-fft")

function hannWindowAnalysis(t) {
  return 0.5 * (1.0 - Math.cos(2.0 * Math.PI * t));
}

function hannWindowSynthesis(t) {
  return hannWindowAnalysis(t) * 2.0 / 3.0
}

function initWindow(frame_size, window_func) {
  var ftwindow = new Float32Array(frame_size)
  for(var i=0; i<frame_size; ++i) {
    ftwindow[i] = window_func(i / (frame_size-1))
  }
  return ftwindow
}

function forwardSTFT(frame_size, onstft, options) {
  options = options || {}
  
  var hop_size = options.hop_size || frame_size>>>2
  var buffer   = new Float32Array(frame_size * 2)
  var ptr      = 0
  var window   = initWindow(frame_size, options.window_func||hannWindowAnalysis)
  var out_x    = new Float32Array(frame_size)
  var out_y    = new Float32Array(frame_size)
  var real     = ndarray(out_x)
  var imag     = ndarray(out_y)
  
  function ondata(frame) {
    var n = frame_size
    var i, j, k
    var W = window, B = buffer, X = out_x, Y = out_y
    
    //Copy data into buffer
    B.set(frame, ptr)
    ptr += n
    
    //Emit frames
    for(j=0; j+n<=ptr; j+=hop_size) {
      for(i=0; i<n; ++i) {
        X[i] = B[i+j] * W[i]
      }
      for(i=0; i<n; ++i) {
        Y[i] = 0.0
      }
      fft(1, real, imag)
      onstft(X, Y)
    }
    
    //Shift buffer backwards
    k = ptr
    for(i=0; j<k; ++i, ++j) {
      B[i] = B[j]
    }
    ptr = i
  }
  
  return ondata
}

function inverseSTFT(frame_size, onistft, options) {
  options = options || {}
  
  var hop_size = options.hop_size || frame_size>>>2
  var buffer   = new Float32Array(frame_size * 2)
  var output   = buffer.subarray(0, frame_size)
  var sptr     = 0
  var eptr     = 0
  var window   = initWindow(frame_size, options.window_func||hannWindowSynthesis)
  var real     = ndarray(window)
  var imag     = ndarray(window)
  
  function ondata(X, Y) {
    var n = frame_size
    var i, j, k
    var W = window, B = buffer
    
    //FFT input signal
    real.data = X
    imag.data = Y
    fft(-1, real, imag)

    //Overlap-add
    k = eptr
    for(i=0, j=sptr; j<k; ++i, ++j) {
      B[j] += W[i] * X[i]
    }
    for(; i < n; ++i, ++j) {
      B[j] = W[i] * X[i]
    }
    sptr += hop_size
    eptr = j

    //Emit frames
    while(sptr >= n) {
      onistft(output)
      for(i=0, j=n; i<n; ++i, ++j) {
        B[i] = B[j]
      }
      eptr -= n
      sptr -= n
    }
  }
  
  return ondata
}

function STFT(dir, frame_size, ondata, options) {
  if(dir >= 0) {
    return forwardSTFT(frame_size, ondata, options)
  } else {
    return inverseSTFT(frame_size, ondata, options)
  }
}

module.exports = STFT
module.exports.stft = forwardSTFT
module.exports.istft = inverseSTFT
},{"ndarray":29,"ndarray-fft":26}],36:[function(require,module,exports){
var Note = require('./lib/note');
var Interval = require('./lib/interval');
var Chord = require('./lib/chord');
var Scale = require('./lib/scale');

var teoria;

// never thought I would write this, but: Legacy support
function intervalConstructor(from, to) {
  // Construct a Interval object from string representation
  if (typeof from === 'string')
    return Interval.toCoord(from);

  if (typeof to === 'string' && from instanceof Note)
    return Interval.from(from, Interval.toCoord(to));

  if (to instanceof Interval && from instanceof Note)
    return Interval.from(from, to);

  if (to instanceof Note && from instanceof Note)
    return Interval.between(from, to);

  throw new Error('Invalid parameters');
}

intervalConstructor.toCoord = Interval.toCoord;
intervalConstructor.from = Interval.from;
intervalConstructor.between = Interval.between;
intervalConstructor.invert = Interval.invert;

function noteConstructor(name, duration) {
  if (typeof name === 'string')
    return Note.fromString(name, duration);
  else
    return new Note(name, duration);
}

noteConstructor.fromString = Note.fromString;
noteConstructor.fromKey = Note.fromKey;
noteConstructor.fromFrequency = Note.fromFrequency;
noteConstructor.fromMIDI = Note.fromMIDI;

function chordConstructor(name, symbol) {
  if (typeof name === 'string') {
    var root, octave;
    root = name.match(/^([a-h])(x|#|bb|b?)/i);
    if (root && root[0]) {
      octave = typeof symbol === 'number' ? symbol.toString(10) : '4';
      return new Chord(Note.fromString(root[0].toLowerCase() + octave),
                            name.substr(root[0].length));
    }
  } else if (name instanceof Note)
    return new Chord(name, symbol);

  throw new Error('Invalid Chord. Couldn\'t find note name');
}

function scaleConstructor(tonic, scale) {
  tonic = (tonic instanceof Note) ? tonic : teoria.note(tonic);
  return new Scale(tonic, scale);
}

teoria = {
  note: noteConstructor,

  chord: chordConstructor,

  interval: intervalConstructor,

  scale: scaleConstructor,

  Note: Note,
  Chord: Chord,
  Scale: Scale,
  Interval: Interval
};


require('./lib/sugar')(teoria);
exports = module.exports = teoria;

},{"./lib/chord":37,"./lib/interval":38,"./lib/note":40,"./lib/scale":41,"./lib/sugar":42}],37:[function(require,module,exports){
var daccord = require('daccord');
var knowledge = require('./knowledge');
var Note = require('./note');
var Interval = require('./interval');

function Chord(root, name) {
  if (!(this instanceof Chord)) return new Chord(root, name);
  name = name || '';
  this.name = root.name().toUpperCase() + root.accidental() + name;
  this.symbol = name;
  this.root = root;
  this.intervals = [];
  this._voicing = [];

  var bass = name.split('/');
  if (bass.length === 2 && bass[1].trim() !== '9') {
    name = bass[0];
    bass = bass[1].trim();
  } else {
    bass = null;
  }

  this.intervals = daccord(name).map(Interval.toCoord);
  this._voicing = this.intervals.slice();

  if (bass) {
    var intervals = this.intervals, bassInterval, note;
    // Make sure the bass is atop of the root note
    note = Note.fromString(bass + (root.octave() + 1)); // crude

    bassInterval = Interval.between(root, note);
    bass = bassInterval.simple();
    bassInterval = bassInterval.invert().direction('down');

    this._voicing = [bassInterval];
    for (var i = 0, length = intervals.length;  i < length; i++) {
      if (!intervals[i].simple().equal(bass))
        this._voicing.push(intervals[i]);
    }
  }
}

Chord.prototype = {
  notes: function() {
    var root = this.root;
    return this.voicing().map(function(interval) {
      return root.interval(interval);
    });
  },

  simple: function() {
    return this.notes().map(function(n) { return n.toString(true); });
  },

  bass: function() {
    return this.root.interval(this._voicing[0]);
  },

  voicing: function(voicing) {
    // Get the voicing
    if (!voicing) {
      return this._voicing;
    }

    // Set the voicing
    this._voicing = [];
    for (var i = 0, length = voicing.length; i < length; i++) {
      this._voicing[i] = Interval.toCoord(voicing[i]);
    }

    return this;
  },

  resetVoicing: function() {
    this._voicing = this.intervals;
  },

  dominant: function(additional) {
    additional = additional || '';
    return new Chord(this.root.interval('P5'), additional);
  },

  subdominant: function(additional) {
    additional = additional || '';
    return new Chord(this.root.interval('P4'), additional);
  },

  parallel: function(additional) {
    additional = additional || '';
    var quality = this.quality();

    if (this.chordType() !== 'triad' || quality === 'diminished' ||
        quality === 'augmented') {
      throw new Error('Only major/minor triads have parallel chords');
    }

    if (quality === 'major') {
      return new Chord(this.root.interval('m3', 'down'), 'm');
    } else {
      return new Chord(this.root.interval('m3', 'up'));
    }
  },

  quality: function() {
    var third, fifth, seventh, intervals = this.intervals;

    for (var i = 0, length = intervals.length; i < length; i++) {
      if (intervals[i].number() === 3) {
        third = intervals[i];
      } else if (intervals[i].number() === 5) {
        fifth = intervals[i];
      } else if (intervals[i].number() === 7) {
        seventh = intervals[i];
      }
    }

    if (!third) {
      return;
    }

    third = (third.direction() === 'down') ? third.invert() : third;
    third = third.simple().toString();

    if (fifth) {
      fifth = (fifth.direction === 'down') ? fifth.invert() : fifth;
      fifth = fifth.simple().toString();
    }

    if (seventh) {
      seventh = (seventh.direction === 'down') ? seventh.invert() : seventh;
      seventh = seventh.simple().toString();
    }

    if (third === 'M3') {
      if (fifth === 'A5') {
        return 'augmented';
      } else if (fifth === 'P5') {
        return (seventh === 'm7') ? 'dominant' : 'major';
      }

      return 'major';
    } else if (third === 'm3') {
      if (fifth === 'P5') {
        return 'minor';
      } else if (fifth === 'd5') {
        return (seventh === 'm7') ? 'half-diminished' : 'diminished';
      }

      return 'minor';
    }
  },

  chordType: function() { // In need of better name
    var length = this.intervals.length, interval, has, invert, i, name;

    if (length === 2) {
      return 'dyad';
    } else if (length === 3) {
      has = {unison: false, third: false, fifth: false};
      for (i = 0; i < length; i++) {
        interval = this.intervals[i];
        invert = interval.invert();
        if (interval.base() in has) {
          has[interval.base()] = true;
        } else if (invert.base() in has) {
          has[invert.base()] = true;
        }
      }

      name = (has.unison && has.third && has.fifth) ? 'triad' : 'trichord';
    } else if (length === 4) {
      has = {unison: false, third: false, fifth: false, seventh: false};
      for (i = 0; i < length; i++) {
        interval = this.intervals[i];
        invert = interval.invert();
        if (interval.base() in has) {
          has[interval.base()] = true;
        } else if (invert.base() in has) {
          has[invert.base()] = true;
        }
      }

      if (has.unison && has.third && has.fifth && has.seventh) {
        name = 'tetrad';
      }
    }

    return name || 'unknown';
  },

  get: function(interval) {
    if (typeof interval === 'string' && interval in knowledge.stepNumber) {
      var intervals = this.intervals, i, length;

      interval = knowledge.stepNumber[interval];
      for (i = 0, length = intervals.length; i < length; i++) {
        if (intervals[i].number() === interval) {
          return this.root.interval(intervals[i]);
        }
      }

      return null;
    } else {
      throw new Error('Invalid interval name');
    }
  },

  interval: function(interval) {
    return new Chord(this.root.interval(interval), this.symbol);
  },

  transpose: function(interval) {
    this.root.transpose(interval);
    this.name = this.root.name().toUpperCase() +
                this.root.accidental() + this.symbol;

    return this;
  },

  toString: function() {
    return this.name;
  }
};

module.exports = Chord;

},{"./interval":38,"./knowledge":39,"./note":40,"daccord":20}],38:[function(require,module,exports){
var knowledge = require('./knowledge');
var vector = require('./vector');
var toCoord = require('interval-coords');

function Interval(coord) {
  if (!(this instanceof Interval)) return new Interval(coord);
  this.coord = coord;
}

Interval.prototype = {
  name: function() {
    return knowledge.intervalsIndex[this.number() - 1];
  },

  semitones: function() {
    return vector.sum(vector.mul(this.coord, [12, 7]));
  },

  number: function() {
    return Math.abs(this.value());
  },

  value: function() {
    var toMultiply = Math.floor((this.coord[1] - 2) / 7) + 1;
    var product = vector.mul(knowledge.sharp, toMultiply);
    var without = vector.sub(this.coord, product);
    var i = knowledge.intervalFromFifth[without[1] + 5];
    var diff = without[0] - knowledge.intervals[i][0];
    var val = knowledge.stepNumber[i] + diff * 7;

    return (val > 0) ? val : val - 2;
  },

  type: function() {
    return knowledge.intervals[this.base()][0] <= 1 ? 'perfect' : 'minor';
  },

  base: function() {
    var product = vector.mul(knowledge.sharp, this.qualityValue());
    var fifth = vector.sub(this.coord, product)[1];
    fifth = this.value() > 0 ? fifth + 5 : -(fifth - 5) % 7;
    fifth = fifth < 0 ? knowledge.intervalFromFifth.length + fifth : fifth;

    var name = knowledge.intervalFromFifth[fifth];
    if (name === 'unison' && this.number() >= 8)
      name = 'octave';

    return name;
  },

  direction: function(dir) {
    if (dir) {
      var is = this.value() >= 1 ? 'up' : 'down';
      if (is !== dir)
        this.coord = vector.mul(this.coord, -1);

      return this;
    }
    else
      return this.value() >= 1 ? 'up' : 'down';
  },

  simple: function(ignore) {
    // Get the (upwards) base interval (with quality)
    var simple = knowledge.intervals[this.base()];
    var toAdd = vector.mul(knowledge.sharp, this.qualityValue());
    simple = vector.add(simple, toAdd);

    // Turn it around if necessary
    if (!ignore)
      simple = this.direction() === 'down' ? vector.mul(simple, -1) : simple;

    return new Interval(simple);
  },

  isCompound: function() {
    return this.number() > 8;
  },

  octaves: function() {
    var toSubtract, without, octaves;

    if (this.direction() === 'up') {
      toSubtract = vector.mul(knowledge.sharp, this.qualityValue());
      without = vector.sub(this.coord, toSubtract);
      octaves = without[0] - knowledge.intervals[this.base()][0];
    } else {
      toSubtract = vector.mul(knowledge.sharp, -this.qualityValue());
      without = vector.sub(this.coord, toSubtract);
      octaves = -(without[0] + knowledge.intervals[this.base()][0]);
    }

    return octaves;
  },

  invert: function() {
    var i = this.base();
    var qual = this.qualityValue();
    var acc = this.type() === 'minor' ? -(qual - 1) : -qual;
    var idx = 9 - knowledge.stepNumber[i] - 1;
    var coord = knowledge.intervals[knowledge.intervalsIndex[idx]];
    coord = vector.add(coord, vector.mul(knowledge.sharp, acc));

    return new Interval(coord);
  },

  quality: function(lng) {
    var quality = knowledge.alterations[this.type()][this.qualityValue() + 2];

    return lng ? knowledge.qualityLong[quality] : quality;
  },

  qualityValue: function() {
    if (this.direction() === 'down')
      return Math.floor((-this.coord[1] - 2) / 7) + 1;
    else
      return Math.floor((this.coord[1] - 2) / 7) + 1;
  },

  equal: function(interval) {
      return this.coord[0] === interval.coord[0] &&
          this.coord[1] === interval.coord[1];
  },

  greater: function(interval) {
    var semi = this.semitones();
    var isemi = interval.semitones();

    // If equal in absolute size, measure which interval is bigger
    // For example P4 is bigger than A3
    return (semi === isemi) ?
      (this.number() > interval.number()) : (semi > isemi);
  },

  smaller: function(interval) {
    return !this.equal(interval) && !this.greater(interval);
  },

  add: function(interval) {
    return new Interval(vector.add(this.coord, interval.coord));
  },

  toString: function(ignore) {
    // If given true, return the positive value
    var number = ignore ? this.number() : this.value();

    return this.quality() + number;
  }
};

Interval.toCoord = function(simple) {
  var coord = toCoord(simple);
  if (!coord)
    throw new Error('Invalid simple format interval');

  return new Interval(coord);
};

Interval.from = function(from, to) {
  return from.interval(to);
};

Interval.between = function(from, to) {
  return new Interval(vector.sub(to.coord, from.coord));
};

Interval.invert = function(sInterval) {
  return Interval.toCoord(sInterval).invert().toString();
};

module.exports = Interval;

},{"./knowledge":39,"./vector":43,"interval-coords":25}],39:[function(require,module,exports){
// Note coordinates [octave, fifth] relative to C
module.exports = {
  notes: {
    c: [0, 0],
    d: [-1, 2],
    e: [-2, 4],
    f: [1, -1],
    g: [0, 1],
    a: [-1, 3],
    b: [-2, 5],
    h: [-2, 5]
  },

  intervals: {
    unison: [0, 0],
    second: [3, -5],
    third: [2, -3],
    fourth: [1, -1],
    fifth: [0, 1],
    sixth: [3, -4],
    seventh: [2, -2],
    octave: [1, 0]
  },

  intervalFromFifth: ['second', 'sixth', 'third', 'seventh', 'fourth',
                         'unison', 'fifth'],

  intervalsIndex: ['unison', 'second', 'third', 'fourth', 'fifth',
                      'sixth', 'seventh', 'octave', 'ninth', 'tenth',
                      'eleventh', 'twelfth', 'thirteenth', 'fourteenth',
                      'fifteenth'],

// linear index to fifth = (2 * index + 1) % 7
  fifths: ['f', 'c', 'g', 'd', 'a', 'e', 'b'],
  accidentals: ['bb', 'b', '', '#', 'x'],

  sharp: [-4, 7],
  A4: [3, 3],

  durations: {
    '0.25': 'longa',
    '0.5': 'breve',
    '1': 'whole',
    '2': 'half',
    '4': 'quarter',
    '8': 'eighth',
    '16': 'sixteenth',
    '32': 'thirty-second',
    '64': 'sixty-fourth',
    '128': 'hundred-twenty-eighth'
  },

  qualityLong: {
    P: 'perfect',
    M: 'major',
    m: 'minor',
    A: 'augmented',
    AA: 'doubly augmented',
    d: 'diminished',
    dd: 'doubly diminished'
  },

  alterations: {
    perfect: ['dd', 'd', 'P', 'A', 'AA'],
    minor: ['dd', 'd', 'm', 'M', 'A', 'AA']
  },

  symbols: {
    'min': ['m3', 'P5'],
    'm': ['m3', 'P5'],
    '-': ['m3', 'P5'],

    'M': ['M3', 'P5'],
    '': ['M3', 'P5'],

    '+': ['M3', 'A5'],
    'aug': ['M3', 'A5'],

    'dim': ['m3', 'd5'],
    'o': ['m3', 'd5'],

    'maj': ['M3', 'P5', 'M7'],
    'dom': ['M3', 'P5', 'm7'],
    'ø': ['m3', 'd5', 'm7'],

    '5': ['P5']
  },

  chordShort: {
    'major': 'M',
    'minor': 'm',
    'augmented': 'aug',
    'diminished': 'dim',
    'half-diminished': '7b5',
    'power': '5',
    'dominant': '7'
  },

  stepNumber: {
    'unison': 1,
    'first': 1,
    'second': 2,
    'third': 3,
    'fourth': 4,
    'fifth': 5,
    'sixth': 6,
    'seventh': 7,
    'octave': 8,
    'ninth': 9,
    'eleventh': 11,
    'thirteenth': 13
  },

  // Adjusted Shearer syllables - Chromatic solfege system
  // Some intervals are not provided for. These include:
  // dd2 - Doubly diminished second
  // dd3 - Doubly diminished third
  // AA3 - Doubly augmented third
  // dd6 - Doubly diminished sixth
  // dd7 - Doubly diminished seventh
  // AA7 - Doubly augmented seventh
  intervalSolfege: {
    'dd1': 'daw',
    'd1': 'de',
    'P1': 'do',
    'A1': 'di',
    'AA1': 'dai',
    'd2': 'raw',
    'm2': 'ra',
    'M2': 're',
    'A2': 'ri',
    'AA2': 'rai',
    'd3': 'maw',
    'm3': 'me',
    'M3': 'mi',
    'A3': 'mai',
    'dd4': 'faw',
    'd4': 'fe',
    'P4': 'fa',
    'A4': 'fi',
    'AA4': 'fai',
    'dd5': 'saw',
    'd5': 'se',
    'P5': 'so',
    'A5': 'si',
    'AA5': 'sai',
    'd6': 'law',
    'm6': 'le',
    'M6': 'la',
    'A6': 'li',
    'AA6': 'lai',
    'd7': 'taw',
    'm7': 'te',
    'M7': 'ti',
    'A7': 'tai',
    'dd8': 'daw',
    'd8': 'de',
    'P8': 'do',
    'A8': 'di',
    'AA8': 'dai'
  }
};

},{}],40:[function(require,module,exports){
var scientific = require('scientific-notation');
var helmholtz = require('helmholtz');
var pitchFq = require('pitch-fq');
var knowledge = require('./knowledge');
var vector = require('./vector');
var Interval = require('./interval');

function pad(str, ch, len) {
  for (; len > 0; len--) {
    str += ch;
  }

  return str;
}


function Note(coord, duration) {
  if (!(this instanceof Note)) return new Note(coord, duration);
  duration = duration || {};

  this.duration = { value: duration.value || 4, dots: duration.dots || 0 };
  this.coord = coord;
}

Note.prototype = {
  octave: function() {
    return this.coord[0] + knowledge.A4[0] - knowledge.notes[this.name()][0] +
      this.accidentalValue() * 4;
  },

  name: function() {
    var value = this.accidentalValue();
    var idx = this.coord[1] + knowledge.A4[1] - value * 7 + 1;
    return knowledge.fifths[idx];
  },

  accidentalValue: function() {
    return Math.round((this.coord[1] + knowledge.A4[1] - 2) / 7);
  },

  accidental: function() {
    return knowledge.accidentals[this.accidentalValue() + 2];
  },

  /**
   * Returns the key number of the note
   */
  key: function(white) {
    if (white)
      return this.coord[0] * 7 + this.coord[1] * 4 + 29;
    else
      return this.coord[0] * 12 + this.coord[1] * 7 + 49;
  },

  /**
  * Returns a number ranging from 0-127 representing a MIDI note value
  */
  midi: function() {
    return this.key() + 20;
  },

  /**
   * Calculates and returns the frequency of the note.
   * Optional concert pitch (def. 440)
   */
  fq: function(concertPitch) {
    return pitchFq(this.coord, concertPitch);
  },

  /**
   * Returns the pitch class index (chroma) of the note
   */
  chroma: function() {
    var value = (vector.sum(vector.mul(this.coord, [12, 7])) - 3) % 12;

    return (value < 0) ? value + 12 : value;
  },

  interval: function(interval) {
    if (typeof interval === 'string') interval = Interval.toCoord(interval);

    if (interval instanceof Interval)
      return new Note(vector.add(this.coord, interval.coord), this.duration);
    else if (interval instanceof Note)
      return new Interval(vector.sub(interval.coord, this.coord));
  },

  transpose: function(interval) {
    this.coord = vector.add(this.coord, interval.coord);
    return this;
  },

  /**
   * Returns the Helmholtz notation form of the note (fx C,, d' F# g#'')
   */
  helmholtz: function() {
    var octave = this.octave();
    var name = this.name();
    name = octave < 3 ? name.toUpperCase() : name.toLowerCase();
    var padchar = octave < 3 ? ',' : '\'';
    var padcount = octave < 2 ? 2 - octave : octave - 3;

    return pad(name + this.accidental(), padchar, padcount);
  },

  /**
   * Returns the scientific notation form of the note (fx E4, Bb3, C#7 etc.)
   */
  scientific: function() {
    return this.name().toUpperCase() + this.accidental() + this.octave();
  },

  /**
   * Returns notes that are enharmonic with this note.
   */
  enharmonics: function(oneaccidental) {
    var key = this.key(), limit = oneaccidental ? 2 : 3;

    return ['m3', 'm2', 'm-2', 'm-3']
      .map(this.interval.bind(this))
      .filter(function(note) {
      var acc = note.accidentalValue();
      var diff = key - (note.key() - acc);

      if (diff < limit && diff > -limit) {
        var product = vector.mul(knowledge.sharp, diff - acc);
        note.coord = vector.add(note.coord, product);
        return true;
      }
    });
  },

  solfege: function(scale, showOctaves) {
    var interval = scale.tonic.interval(this), solfege, stroke, count;
    if (interval.direction() === 'down')
      interval = interval.invert();

    if (showOctaves) {
      count = (this.key(true) - scale.tonic.key(true)) / 7;
      count = (count >= 0) ? Math.floor(count) : -(Math.ceil(-count));
      stroke = (count >= 0) ? '\'' : ',';
    }

    solfege = knowledge.intervalSolfege[interval.simple(true).toString()];
    return (showOctaves) ? pad(solfege, stroke, Math.abs(count)) : solfege;
  },

  scaleDegree: function(scale) {
    var inter = scale.tonic.interval(this);

    // If the direction is down, or we're dealing with an octave - invert it
    if (inter.direction() === 'down' ||
       (inter.coord[1] === 0 && inter.coord[0] !== 0)) {
      inter = inter.invert();
    }

    inter = inter.simple(true).coord;

    return scale.scale.reduce(function(index, current, i) {
      var coord = Interval.toCoord(current).coord;
      return coord[0] === inter[0] && coord[1] === inter[1] ? i + 1 : index;
    }, 0);
  },

  /**
   * Returns the name of the duration value,
   * such as 'whole', 'quarter', 'sixteenth' etc.
   */
  durationName: function() {
    return knowledge.durations[this.duration.value];
  },

  /**
   * Returns the duration of the note (including dots)
   * in seconds. The first argument is the tempo in beats
   * per minute, the second is the beat unit (i.e. the
   * lower numeral in a time signature).
   */
  durationInSeconds: function(bpm, beatUnit) {
    var secs = (60 / bpm) / (this.duration.value / 4) / (beatUnit / 4);
    return secs * 2 - secs / Math.pow(2, this.duration.dots);
  },

  /**
   * Returns the name of the note, with an optional display of octave number
   */
  toString: function(dont) {
    return this.name() + this.accidental() + (dont ? '' : this.octave());
  }
};

Note.fromString = function(name, dur) {
  var coord = scientific(name);
  if (!coord) coord = helmholtz(name);
  return new Note(coord, dur);
};

Note.fromKey = function(key) {
  var octave = Math.floor((key - 4) / 12);
  var distance = key - (octave * 12) - 4;
  var name = knowledge.fifths[(2 * Math.round(distance / 2) + 1) % 7];
  var subDiff = vector.sub(knowledge.notes[name], knowledge.A4);
  var note = vector.add(subDiff, [octave + 1, 0]);
  var diff = (key - 49) - vector.sum(vector.mul(note, [12, 7]));

  var arg = diff ? vector.add(note, vector.mul(knowledge.sharp, diff)) : note;
  return new Note(arg);
};

Note.fromFrequency = function(fq, concertPitch) {
  var key, cents, originalFq;
  concertPitch = concertPitch || 440;

  key = 49 + 12 * ((Math.log(fq) - Math.log(concertPitch)) / Math.log(2));
  key = Math.round(key);
  originalFq = concertPitch * Math.pow(2, (key - 49) / 12);
  cents = 1200 * (Math.log(fq / originalFq) / Math.log(2));

  return { note: Note.fromKey(key), cents: cents };
};

Note.fromMIDI = function(note) {
  return Note.fromKey(note - 20);
};

module.exports = Note;

},{"./interval":38,"./knowledge":39,"./vector":43,"helmholtz":24,"pitch-fq":33,"scientific-notation":34}],41:[function(require,module,exports){
var knowledge = require('./knowledge');
var Interval = require('./interval');

var scales = {
  aeolian: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'm7'],
  blues: ['P1', 'm3', 'P4', 'd5', 'P5', 'm7'],
  chromatic: ['P1', 'm2', 'M2', 'm3', 'M3', 'P4',
    'A4', 'P5', 'm6', 'M6', 'm7', 'M7'],
  dorian: ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'm7'],
  doubleharmonic: ['P1', 'm2', 'M3', 'P4', 'P5', 'm6', 'M7'],
  harmonicminor: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'M7'],
  ionian: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7'],
  locrian: ['P1', 'm2', 'm3', 'P4', 'd5', 'm6', 'm7'],
  lydian: ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'M7'],
  majorpentatonic: ['P1', 'M2', 'M3', 'P5', 'M6'],
  melodicminor: ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'M7'],
  minorpentatonic: ['P1', 'm3', 'P4', 'P5', 'm7'],
  mixolydian: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'm7'],
  phrygian: ['P1', 'm2', 'm3', 'P4', 'P5', 'm6', 'm7'],
  wholetone: ['P1', 'M2', 'M3', 'A4', 'A5', 'A6']
};

// synonyms
scales.harmonicchromatic = scales.chromatic;
scales.minor = scales.aeolian;
scales.major = scales.ionian;
scales.flamenco = scales.doubleharmonic;

function Scale(tonic, scale) {
  if (!(this instanceof Scale)) return new Scale(tonic, scale);
  var scaleName, i;
  if (!('coord' in tonic)) {
    throw new Error('Invalid Tonic');
  }

  if (typeof scale === 'string') {
    scaleName = scale;
    scale = scales[scale];
    if (!scale)
      throw new Error('Invalid Scale');
  } else {
    for (i in scales) {
      if (scales.hasOwnProperty(i)) {
        if (scales[i].toString() === scale.toString()) {
          scaleName = i;
          break;
        }
      }
    }
  }

  this.name = scaleName;
  this.tonic = tonic;
  this.scale = scale;
}

Scale.prototype = {
  notes: function() {
    var notes = [];

    for (var i = 0, length = this.scale.length; i < length; i++) {
      notes.push(this.tonic.interval(this.scale[i]));
    }

    return notes;
  },

  simple: function() {
    return this.notes().map(function(n) { return n.toString(true); });
  },

  type: function() {
    var length = this.scale.length - 2;
    if (length < 8) {
      return ['di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa'][length] +
        'tonic';
    }
  },

  get: function(i) {
    var isStepStr = typeof i === 'string' && i in knowledge.stepNumber;
    i = isStepStr ? knowledge.stepNumber[i] : i;
    var len = this.scale.length;
    var interval, octaves;

    if (i < 0) {
      interval = this.scale[i % len + len - 1];
      octaves = Math.floor((i - 1) / len);
    } else if (i % len === 0) {
      interval = this.scale[len - 1];
      octaves = (i / len) - 1;
    } else {
      interval = this.scale[i % len - 1];
      octaves = Math.floor(i / len);
    }

    return this.tonic.interval(interval).interval(new Interval([octaves, 0]));
  },

  solfege: function(index, showOctaves) {
    if (index)
      return this.get(index).solfege(this, showOctaves);

    return this.notes().map(function(n) {
      return n.solfege(this, showOctaves);
    });
  },

  interval: function(interval) {
    interval = (typeof interval === 'string') ?
      Interval.toCoord(interval) : interval;
    return new Scale(this.tonic.interval(interval), this.scale);
  },

  transpose: function(interval) {
    var scale = this.interval(interval);
    this.scale = scale.scale;
    this.tonic = scale.tonic;

    return this;
  }
};
Scale.KNOWN_SCALES = Object.keys(scales);

module.exports = Scale;

},{"./interval":38,"./knowledge":39}],42:[function(require,module,exports){
var knowledge = require('./knowledge');

module.exports = function(teoria) {
  var Note = teoria.Note;
  var Chord = teoria.Chord;
  var Scale = teoria.Scale;

  Note.prototype.chord = function(chord) {
    var isShortChord = chord in knowledge.chordShort;
    chord = isShortChord ? knowledge.chordShort[chord] : chord;

    return new Chord(this, chord);
  };

  Note.prototype.scale = function(scale) {
    return new Scale(this, scale);
  };
};

},{"./knowledge":39}],43:[function(require,module,exports){
module.exports = {
  add: function(note, interval) {
    return [note[0] + interval[0], note[1] + interval[1]];
  },

  sub: function(note, interval) {
    return [note[0] - interval[0], note[1] - interval[1]];
  },

  mul: function(note, interval) {
    if (typeof interval === 'number')
      return [note[0] * interval, note[1] * interval];
    else
      return [note[0] * interval[0], note[1] * interval[1]];
  },

  sum: function(coord) {
    return coord[0] + coord[1];
  }
};

},{}],44:[function(require,module,exports){
(function (global){
"use strict"

var bits = require("bit-twiddle")
var dup = require("dup")
if(!global.__TYPEDARRAY_POOL) {
  global.__TYPEDARRAY_POOL = {
      UINT8   : dup([32, 0])
    , UINT16  : dup([32, 0])
    , UINT32  : dup([32, 0])
    , INT8    : dup([32, 0])
    , INT16   : dup([32, 0])
    , INT32   : dup([32, 0])
    , FLOAT   : dup([32, 0])
    , DOUBLE  : dup([32, 0])
    , DATA    : dup([32, 0])
  }
}
var POOL = global.__TYPEDARRAY_POOL
var UINT8   = POOL.UINT8
  , UINT16  = POOL.UINT16
  , UINT32  = POOL.UINT32
  , INT8    = POOL.INT8
  , INT16   = POOL.INT16
  , INT32   = POOL.INT32
  , FLOAT   = POOL.FLOAT
  , DOUBLE  = POOL.DOUBLE
  , DATA    = POOL.DATA

function free(array) {
  if(array instanceof ArrayBuffer) {
    var n = array.byteLength|0
      , log_n = bits.log2(n)
    if(n < 32) {
      return
    }
    DATA[log_n].push(array)
  } else {
    var n = array.length|0
      , log_n = bits.log2(n)
    if(n < 32) {
      return
    }
    if(array instanceof Uint8Array) {
      UINT8[log_n].push(array)
    } else if(array instanceof Uint16Array) {
      UINT16[log_n].push(array)
    } else if(array instanceof Uint32Array) {
      UINT32[log_n].push(array)
    } else if(array instanceof Int8Array) {
      INT8[log_n].push(array)
    } else if(array instanceof Int16Array) {
      INT16[log_n].push(array)
    } else if(array instanceof Int32Array) {
      INT32[log_n].push(array)
    } else if(array instanceof Float32Array) {
      FLOAT[log_n].push(array)
    } else if(array instanceof Float64Array) {
      DOUBLE[log_n].push(array)
    }
  }
}
exports.free = free

function malloc(n, dtype) {
  n = Math.max(bits.nextPow2(n), 32)
  var log_n = bits.log2(n)
  if(dtype === undefined) {
    var d = DATA[log_n]
    if(d.length > 0) {
      var r = d[d.length-1]
      d.pop()
      return r
    }
    return new ArrayBuffer(n)
  } else {
    switch(dtype) {
      case "uint8":
        var u8 = UINT8[log_n]
        if(u8.length > 0) {
          var r8 = u8[u8.length-1]
          u8.pop()
          return r8
        }
        return new Uint8Array(n)
      break
      
      case "uint16":
        var u16 = UINT16[log_n]
        if(u16.length > 0) {
          var r16 = u16[u16.length-1]
          u16.pop()
          return r16
        }
        return new Uint16Array(n)
      break
      
      case "uint32":
        var u32 = UINT32[log_n]
        if(u32.length > 0) {
          var r32 = u32[u32.length-1]
          u32.pop()
          return r32
        }
        return new Uint32Array(n)
      break
      
      case "int8":
        var i8 = INT8[log_n]
        if(i8.length > 0) {
          var s8 = i8[i8.length-1]
          i8.pop()
          return s8
        }
        return new Int8Array(n)
      break
      
      case "int16":
        var i16 = INT16[log_n]
        if(i16.length > 0) {
          var s16 = i16[i16.length-1]
          i16.pop()
          return s16
        }
        return new Int16Array(n)
      break
      
      case "int32":
        var i32 = INT32[log_n]
        if(i32.length > 0) {
          var s32 = i32[i32.length-1]
          i32.pop()
          return s32
        }
        return new Int32Array(n)
      break
      
      case "float":
      case "float32":
        var f = FLOAT[log_n]
        if(f.length > 0) {
          var q = f[f.length-1]
          f.pop()
          return q
        }
        return new Float32Array(n)
      break
      
      case "double":
      case "float64":
        var dd = DOUBLE[log_n]
        if(dd.length > 0) {
          var p = dd[dd.length-1]
          dd.pop()
          return p
        }
        return new Float64Array(n)
      break
      
      default:
        return null
    }
  }
  return null
}
exports.malloc = malloc


function clearCache() {
  for(var i=0; i<32; ++i) {
    UINT8[i].length = 0
    UINT16[i].length = 0
    UINT32[i].length = 0
    INT8[i].length = 0
    INT16[i].length = 0
    INT32[i].length = 0
    FLOAT[i].length = 0
    DOUBLE[i].length = 0
    DATA[i].length = 0
  }
}
exports.clearCache = clearCache
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"bit-twiddle":15,"dup":21}],45:[function(require,module,exports){
var Converter = require("./converter.js");
var Scorer = require("./scorer.js");

const OtherInterpretationsOfNotes = (()=>{

    /* Input: an array of pitch classes represented as semitones above the root
       Output: an array of arrays of pitch classes represented as semitones above the root
       Each array here represents the same series of notes, but in reference from a different root
       For instance, the input of [1,4,6] gives the following outputs:
       [1,4,6],[b2,b5,b7],[2,5,7],[b3,b6,1],[3,6,b2],[4,b7,2],
       [b5,7,b3],[5,1,3],[b6,b2,4],[6,2,b5],[b7,b3,5],[7,3,b6]
       You can look at these equivalent progressions and notice some roots
       whose perspectives make the most sense.  In this case, we see that 
       placing the root at the "4" of the original interpretation yields a 
       [5,1,3] which seems to imply that this is how we will hear the notes*/
    const couldBe = semitones => {
        const possibilities = [];
        possibilities.push(semitones);
        for(var i = 1 ; i < 12; ++i){
            semitones = semitones.map(Converter.incrementIntervalClass)
            possibilities.push(semitones)        
        }
        return possibilities;
    }



    const showOtherInterpretations = names => {
        const semitones = names.map(Converter.simpleNameToSemitones);
        const possibilities = couldBe(semitones);
        const scores = possibilities.map(Scorer.dissonanceOfIntervalClassChord);

        $("#otherInterpretations tbody").empty();
        possibilities.forEach((possibility,index)=>{
            const description = possibility.map(Converter.semitonesToSimpleName).toString();
            const score = scores[index].toFixed(1);
            console.log(description,score);
            $("#otherInterpretations tbody").append(
                $("<tr><td>"+description+"&nbsp;&nbsp;</td><td>"+score+"</td></tr>")
            )
        })
    }
    const setup = () => {
        console.log("setup other interprs");
        const handleSubmission = () => {
            const input = $("#scaleDegrees").val();
            const names = input.split(/\s+/).filter(name=>name);
            console.log("names",names);
            showOtherInterpretations(names);
        }
        $("#scaleDegreesButton").on("click",handleSubmission);
        $("#scaleDegrees").on("keydown",e=>{
            if(e.keyCode == 13){
                // enter was pressed
                handleSubmission();
            }
        })
    }
    return ({
        setup:setup
    })
})();

module.exports = OtherInterpretationsOfNotes;
},{"./converter.js":3,"./scorer.js":47}],46:[function(require,module,exports){
var teoria = require("teoria");
var Converter = require("./converter.js");
var AudioPlayer = require("./audioplayer.js");

const Piano = (() => {

    var _rootFrequency = 220;//hz
    var _detuning = 0;
    const s = 100;
    var _intervals = [0,2*s,4*s,5*s,1200-5*s,1200-3*s,1200-s];
    // notes: 0,200,400,500,700,900,1000,1100,1200
    var mode = 0;
    
    const NUM_NOTES_KEPT = 30;
    var _prevNotes = [];
    const _heldDegrees = {};

    const changeSettingsObservers = [];
    const onChangeSettings = f => {
        changeSettingsObservers.push(f);
    }


    const playNoteObservers = [];
    const onPlayNote = f => {
        playNoteObservers.push(f);
    }

    /*
     T T s |T| T T s
     T s T |T| T s T
     s T T |T| s T T
     T T T |s| T T s Lydian
     T T s |T| T s T
     T s T |T| s T T
     s T T |s| T T T
    */

    const scaleDegreeFromKeyCode = keycode => {
        var d;
        // console.log("keycode",keycode);
        switch(keycode){
            case  20: d =  0; break; // caps lock
            case  65: d =  1; break; // a
            case  83: d =  2; break; // s
            case  68: d =  3; break; // d
            case  70: d =  4; break; // f
            case  71: d =  5; break; // g
            case  72: d =  6; break; // h 
            case  74: d =  7; break; // j
            case  75: d =  8; break; // k
            case  76: d =  9; break; // l
            case 186: d = 10; break; // ;
            case 222: d = 11; break; // '
            case  13: d = 12; break; // enter
            
            default:  d = undefined;
        }
        return d;
    }
    const handleDownEvent = e => {
        const d = scaleDegreeFromKeyCode(e.keyCode);
        if(d || d == 0)
        playScaleDegree2(d);
    }
    const handleUpEvent = e => {
        const d = scaleDegreeFromKeyCode(e.keyCode);
        if(d || d == 0)
        stopScaleDegree(d);
    }
    const handleEvent = e => {
        if(e.type == "keydown"){
            handleDownEvent(e);
        }
        else if(e.type == "keyup"){
            handleUpEvent(e);
        }
        else{
            console.log("unsupported event",e);
        }
    }
    const onKeyDownOrUp = e => {
        if(Recorder.isOn()){
            Recorder.recordEvent(e);
        }
        handleEvent(e);
    }
    
    
    const playScaleDegree = degree => {
        /* prevent repeated playing of same note */
        if(_heldDegrees[degree]){
            return;
        }
        _heldDegrees[degree] = true;

        const note = _scale.get(degree);        

        if(_prevNotes.length >= NUM_NOTES_KEPT){
            _prevNotes = _prevNotes.slice(1);
        }
        _prevNotes.push(note);
        playNoteObservers.forEach(obs => obs(note));
        const f = note.fq();
        // console.log("playing note with frequency",f,"degree",degree,"scale",_scale);
        // AudioPlayer.playAttack();
        AudioPlayer.playNote({frequency:f},degree);
    }
    const getDetunedRoot = () => {
        return _rootFrequency * Converter.centsToFraction(_detuning);
    }
    const getFrequencyOfDegree = degree => {
        const mod = Converter.myMod;
        const numNotesInScale = _intervals.length;
        
        const index = mod(degree-1+mode,numNotesInScale);
        const octaves = Math.floor((degree-1+mode)/(numNotesInScale));
        const cents = _intervals[index] - _intervals[mode%numNotesInScale];
        const calculatedFrequency = getDetunedRoot() * Converter.centsToFraction(cents) * Math.pow(2,octaves);
        return calculatedFrequency
    }
    const getScale = () => {
        const scale = [];
        for(var i = 0; i < _intervals.length; ++i){
            var f = getFrequencyOfDegree(i+1);
            var name = Converter.frequencyToName(f);
            scale.push(name);
        }
        console.log("scale",scale);
        return scale;
    }

    const playScaleDegree2 = degree => {
        /* prevent repeated playing of same note */
        if(_heldDegrees[degree]){
            return;
        }
        _heldDegrees[degree] = true;

        const calculatedFrequency = getFrequencyOfDegree(degree);
        console.log("calc f",calculatedFrequency);
        const note = teoria.note.fromFrequency(calculatedFrequency);

        if(_prevNotes.length >= NUM_NOTES_KEPT){
            _prevNotes = _prevNotes.slice(1);
        }
        _prevNotes.push(calculatedFrequency);
        playNoteObservers.forEach(obs => obs(note));
        
        // console.log("playing note with frequency",f,"degree",degree,"scale",_scale);
        // AudioPlayer.playAttack();
        AudioPlayer.playNote({frequency:calculatedFrequency},degree);
    }
    const stopScaleDegree = degree => {
        _heldDegrees[degree] = false;
        AudioPlayer.stopNote(degree);
    }

    /* Controls */

    const setMajor = () => {
        mode = (mode + 1) % _intervals.length;
        notifySettingsChanged();
    }
    const setMinor = () => {
        mode = Converter.myMod(mode - 1, _intervals.length);
        notifySettingsChanged();
    }
    const upHalfStep = () => {
        _rootFrequency *= Converter.centsToFraction(100);
        notifySettingsChanged();
    }
    const downHalfStep = () => {
        _rootFrequency /= Converter.centsToFraction(100);
        notifySettingsChanged();
    }
    const setDetuning = t => {
        _detuning = t;
        notifySettingsChanged();
    }
    const setIntervals = newIntervals => {
        _intervals = newIntervals;
        notifySettingsChanged();
    }
    
    const notifySettingsChanged = () => {
        changeSettingsObservers.forEach(f=>f())
    }
    /* Recorder */
    const Recorder = (()=>{
        var recorded = [];
        var timeoutHandles = [];
        var recording = false;
        var playingBack = false;

        const startRecording = () => {
            recorded = [];
            recording = true;
        }
        const stopRecording = () => {
            recording = false;
        }
        const playback = () => {
            console.log("recorded",recorded);
            if(recorded.length > 0){
                const startTime = recorded[0].timeStamp
                recorded.forEach(e=>{
                   const offset = e.timeStamp - startTime;
                   timeoutHandles.push(setTimeout(()=>handleEvent(e),offset));
                })
            }
        }
        const loop = () => {
            const startTime = recorded[0].timeStamp;
            const endTime = recorded[recorded.length -1].timeStamp;
            const duration = endTime-startTime;
            timeoutHandles.push(setInterval(playback,duration));
        }
        const stopPlayback = () => {
            timeoutHandles.forEach(h=>clearInterval(h));
            timeoutHandles = [];
        }
        const recordEvent = e => {
            recorded.push(e);
        }
        return({
            isOn: ()=>recording,
            recordEvent:recordEvent,
            startRecording:startRecording,
            stopRecording:stopRecording,
            playback:playback,
            loop:loop,
            stopPlayback:stopPlayback
        })
    })()

    const setup = () => {

        const on = (char,f) => {
            const charcode = char.charCodeAt(0);
            const keycode = charcode - 97 + 65;
            $("body").keydown(e=>{
                if(e.keyCode == keycode){
                    f();
                }
            })
        }

        $("body").keydown(onKeyDownOrUp).keyup(onKeyDownOrUp);    
        on('n',setMinor);
        on('m',setMajor);
        on('b',upHalfStep);
        on('v',downHalfStep);
        on('q',AudioPlayer.randomizeAmplitudes);
    }
    

    return ({
        onKeyDownOrUp:onKeyDownOrUp,
        downHalfStep:downHalfStep,
        upHalfStep:upHalfStep,
        setMajor:setMajor,
        setMinor:setMinor,
        setup:setup,

        getMode: ()=>mode,
        getRoot: ()=>_rootFrequency,
        getIntervals: ()=>_intervals,
        getScale: getScale,
        setIntervals:setIntervals,
        setDetuning:setDetuning,

        startRecording:Recorder.startRecording,
        stopRecording:Recorder.stopRecording,
        playback:Recorder.playback,
        stopPlayback:Recorder.playback,
        getRecentNotes:num=>{
            if(num){
                return _prevNotes.slice(-num);
            }
            else{
                return _prevNotes;
            }
        },
        onPlayNote:onPlayNote,
        onChangeSettings:onChangeSettings,
        loop:Recorder.loop
    })

})()

module.exports = Piano;
},{"./audioplayer.js":1,"./converter.js":3,"teoria":36}],47:[function(require,module,exports){
var Converter = require("./converter.js");

const Scorer = (()=>{
    /* These dissonance values rate various intervals on their dissonance.
    I got them by looking at a graph online 
    Here, the index in the array represents the pitch class that many semitones above the root*/
    const vagueDissonanceFromGraph = [0   , 5.5, 3  , 1.9, 2.2, 1.5, 2.7, 0.5, 2.7, .9 , 1.5, 2.1]
    
    const dissonanceOfIntervalClass = intervalClass => {
        return vagueDissonanceFromGraph[intervalClass];
    }

    /* Ignores the concept that a 9 and a 2 may have different levels of dissonance */
    const dissonanceOfInterval = interval => {
        intervalClass = Converter.intervalToIntervalClass(interval);
        return dissonanceOfIntervalClass(intervalClass);
    }

    /* Input: an array of interval classes
       Output: a total score of dissonance
       The input would look like this: [0,2,7].
       which is interpreted as a root, its second, and fifth
       And the result is the sum of dissonance for playing those notes,
       since this is a SUS2 it should be a bit higher than a major chord */
    const dissonanceOfIntervalClassChord = semitones => {
        return semitones.reduce((acc,curr)=>{
            return acc + dissonanceOfIntervalClass(curr);
        },0)
    }
    
    /* Calculates the 'roughness' of two sinusoidal tones played simultaneously.
    Input: frequencies and amplitudes of the two tones 
    Output: a number representing the roughness
    */
    const sineRoughness = (f1,f2,A1,A2) => {
        /* default amplitudes */
        if(A1 == undefined){A1=1}
        if(A2 == undefined){A2=1}
        /* labels */
        const fmax = Math.max(f1,f2);
        const fmin = Math.min(f1,f2);
        const Amax = Math.max(A1,A2);
        const Amin = Math.min(A1,A2);
        /* X term */
        const X = Amin * Amax;
        /* Y term */
        const Y = (2 * Amin) / (Amin + Amax)
        /* Z term */
        // constants
        const b1 = 3.5;
        const b2 = 5.75;
        const s1 = 0.0207;
        const s2 = 18.96;
        const s  = 0.24/(s1*fmin + s2)
        // calculation
        const firstTerm =   Math.exp(-b1*s*(fmax-fmin));
        const secondTerm = -Math.exp(-b2*s*(fmax-fmin));
        const Z = 5*firstTerm + 5*secondTerm;
        /* Full formula */
        const R = Math.pow(X,0.1) * 0.5 * (Math.pow(Y,3.11)) * Z;
        return R;
    }

    /* Calculates the roughness of two notes played simultaneously.
    Each note is interpreted to be a combination of sinusoidal tones, according to harmonics
    So a note with frequency f has harmonics at f*2, f*3, f*4, ...
    This function only calculates harmonics up to ... 5? for each note
    And assumes they go down in amplitude at a proportion of 0.88 each harmonic 
    And it just adds the total roughness of comparing each tone of each note against each tone of the other note*/
    const noteRoughness = (f1,f2) => {
        var roughness = 0;
        for(var i = 1; i < 6; ++i){
            for(var j = 1; j < 6; ++j){
                roughness += sineRoughness(f1*i,f2*j,Math.pow(0.88,i),Math.pow(0.88,j));
            }
        }
        return roughness;
    }

    /* This scores every interval against a chosen root
       This is as if every note were played along the root, which doesn't actually 
       happen, which makes this a poor choice for analyzing harmonicity */
    const scoreScenario = scenario => {
        const f1 = scenario.root.fq();
        return scenario.intervals.reduce((acc,curr)=>{
            f2 = scenario.root.interval(curr).fq();
            return acc + noteRoughness(f1,f2);
        },0)
    }

    return({
        dissonanceOfInterval:dissonanceOfInterval,
        dissonanceOfIntervalClass:dissonanceOfIntervalClass,
        dissonanceOfIntervalClassChord:dissonanceOfIntervalClassChord
    })
})()

module.exports = Scorer;
},{"./converter.js":3}],48:[function(require,module,exports){


const spectrum = (()=>{
    const xs = new Array(1200).fill(0).map((x,index)=>index);
    const create = () => {
        var ys = new Array(1200).fill(0);

        const set = (freq,amp)=>{
            while(freq < 1200){
                freq += 1200;
            }
            ys[freq%1200] = amp;
        }
        const setAll = newYs => ys = newYs;

        const get = freq => {
            while(freq < 1200){
                freq += 1200;
            }
            return ys[freq%1200];
        }
        const getAll = () => ys;

        const shiftUp = cents => {
            if(cents < 0 ){
                console.error("dont shift up by a negative number!");
                return this;
            }
            while(cents >= 1200){
                cents -= 1200;
            }
            // shiftUp by 2
            //[a,b,c,d,e]
            //[d,e,a,b,c]
            result = create();
            result.setAll(ys.slice(1200-cents).concat(ys.slice(0,1200-cents)));
            return result;
        }
        const add = spectrum => {
            result = create();
            for(var i = 0; i < 1200; ++i){
                result.set(i,get(i)+spectrum.get(i))
            }
            return result;
        }
        const plotMe = (elementID,title) => {
            plot(elementID,xs,ys,title,"frequency","amplitude");
        }
        const totalAmplitude = () => {
            return ys.reduce((acc,curr)=>acc+curr,0);
        }
        const scale = factor => {
            for(var i = 0; i < 1200; ++i){
                ys[i] = ys[i]*factor;
            }
        }
        const times = spectrum => {
            var result = create();
            for(var i = 0; i < 1200; ++i){
                result.set(i,ys[i]*spectrum.get(i));
            }
            return result;
        }
        const and = spectrum => {
            var result = create();
            for(var i = 0; i < 1200; ++i){
                result.set(i,Math.min(ys[i],spectrum.get(i)));
            }
            return result;
        }
        return {
            set:set,
            setAll:setAll,
            get:get,
            getAll:getAll,
            shiftUp:shiftUp,
            add:add,
            plot:plotMe,
            totalAmplitude:totalAmplitude,
            scale:scale,
            times:times,
            and:and
        }
    }
    return create;
})();






},{}],49:[function(require,module,exports){
const piano = require("./piano.js");
const Converter = require("./converter.js");
const AudioPlayer = require("./audioplayer.js");

const TimbreControls = (()=>{
    const setupVolumeComponent = () => {
        $("#volume").val(15);
        $("#volume").on("change",function(){
            AudioPlayer.setVolume(parseInt($(this).val()))
        })
    }
    const setupTimbreComponent = () => {
        const updateHarmonicAmplitudes = () => {
            $("#harmonicAmplitudes input").each(function(index){
                AudioPlayer.setAmplitude(index+1,$(this).val());
                AudioPlayer.setWaveTable("custom");
                $("#waveTableDropdown").val("custom");
            })
        }
        updateHarmonicAmplitudes();
        $("#harmonicAmplitudes input").on("change",function(){
            updateHarmonicAmplitudes();
        })
    }
    const setupWaveTableDropdown = () => {
        Object.keys(WaveTables()).forEach(key=>{
            $("#waveTableDropdown").append($("<option>"+key+"</option>").val(key))
        })
        
        $("#waveTableDropdown").on("change",function(){
            const v = $("#waveTableDropdown").val()
            AudioPlayer.setWaveTable(v);
            if(v == "custom"){
                $("#harmonicAmplitudes").show();
            }
            else{
                $("#harmonicAmplitudes").hide();
            }
        })
    }
    const setupCurrentScale = () => {
        const updateDisplay = () => {
            $("#currentMode").text(piano.getMode());
            $("#currentRoot").text(Converter.frequencyToName(piano.getRoot()));
            $("#currentIntervals").val(piano.getIntervals().join(" "));
            console.log("update display called");
            $("#currentScale").text(piano.getScale().toString());
            const handleUpdateIntervals = () => {
                piano.setIntervals($("#currentIntervals").val().split(/\s+/).filter(name=>name.length>0));
            }
            $("#currentIntervals").on("keydown",e=>{
                if(e.keyCode==13){
                    handleUpdateIntervals();
                    $("#currentIntervals").blur();
                }
            })
            $("#currentIntervalsButton").on("click",handleUpdateIntervals);
        }
        updateDisplay();
        piano.onChangeSettings(updateDisplay);
    }
    const setupCurrentDetuning = () => {
        const updateCurrentDetuning = () => {
            const detuning = parseInt($("#currentDetuning").val());
            piano.setDetuning(detuning);
        }
        $("#currentDetuning").on("change",updateCurrentDetuning);
        $("#currentDetuning").val(0);
    }
    const setup = () => {
        setupVolumeComponent();
        setupWaveTableDropdown();
        setupTimbreComponent();
        setupCurrentScale();
        setupCurrentDetuning();
        
    }
    /****************/
    return({
        setup:setup
    })
})()

module.exports = TimbreControls;
},{"./audioplayer.js":1,"./converter.js":3,"./piano.js":46}],50:[function(require,module,exports){
const WaveTables = (audioCtx=>{
    const piano = {"real":[0,0,-0.203569,0.5,-0.401676,0.137128,-0.104117,0.115965,-0.004413,0.067884,-0.00888,0.0793,-0.038756,0.011882,-0.030883,0.027608,-0.013429,0.00393,-0.014029,0.00972,-0.007653,0.007866,-0.032029,0.046127,-0.024155,0.023095,-0.005522,0.004511,-0.003593,0.011248,-0.004919,0.008505,-0.00292,0.00152,-0.005641,0.002615,-0.001866,0.001316,-0.00032,0.0008,-0.000957,0.001989,-0.001172,0.001682,-0.00262,0.000544,-0.000734,0.000186,-0.000363,0.000243,-0.000142,0.000437,-0.00086,0.000117,-0.00035,0.00011,-0.000253,0.000218,-0.000061,0.000015,-0.000038,0.000017,-0.000025,0.000007,-0.000081,0.000017,-0.000064,0.000166,-0.000009,0.000013,-0.000024,0.000001,-0.000032,0.000013,-0.000018,0.000007,-0.000013,0.00001,-0.000023,0.000008,-0.000025,0.000046,-0.000035,0.000006,-0.000012,0.000012,-0.000024,0.000023,-0.000024,0.000027,-0.00001,0.000022,-0.000011,0.000021,-0.000007,0.000011,-0.000006,0.000021,-0.000014,0.000026,-0.000013,0.000003,-0.000032,0.000033,-0.000036,0.000025,-0.00002,0.000026,-0.00005,0.000028,-0.000013,0.000008,-0.000018,0.00002,-0.000086,0.00012,-0.000005,0.000012,-0.000016,0.000028,-0.000012,0.000006,-0.000015,0.000012,-0.000022,0.000012,-0.000023,0.000024,-0.000011,0.000022,-0.000009,0.000018,-0.000019,0.000013,-0.000042,0.000015,-0.000019,0.000014,-0.000019,0.000007,-0.000008,0.00003,-0.000011,0.000011,-0.000012,0.000022,-0.000007,0.000018,-0.000028,0.000025,-0.00002,0.000008,-0.000032,0.000022,-0.00001,0.000013,-0.000026,0.000013,-0.000024,0.000009,-0.000107,0.000109,-0.000007,0.000014,-0.000015,0.000007,-0.000029,0.000045,-0.000023,0.000039,-0.00001,0.000029,-0.000008,0.000036,-0.000018,0.000007,-0.000007,0.000007,-0.000025,0.00001,-0.000006,0.000022,-0.000021,0.000007,-0.000018,0.000011,-0.000011,0.00001,-0.000015,0.00002,-0.000012,0.000004,-0.000005,0.000007,-0.000007,0.000003,-0.000001,0.000006,-0.000007,0.000018,-0.000002,0.000005,-0.000008,0.000006,-0.00001,0.000016,-0.00001,0.000021,-0.000011,0.000013,-0.000011,0.000005,-0.000006,0.000016,-0.000014,0.000014,-0.000009,0.000009,-0.000004,0.000013,-0.000015,0.000004,-0.000007,0.000007,-0.000004,0.000004,-0.000009,0.00001,-0.000008,0.000013,-0.000012,0.000001,-0.000003,0.000012,-0.000004,0.000004,-0.000007,0.000008,-0.00001,0.000013,-0.000015,0.000013,-0.00001,0.000012,-0.000008,0.000011,-0.000024,0.000008,-0.000013,0.000013,-0.000018,0.000005,-0.000022,0.000037,-0.000019,0.000027,-0.000022,0.000026,-0.000029,0.000029,-0.000029,0.000031,-0.000034,0.000032,-0.000031,0.000037,-0.000033,0.000038,-0.000038,0.000039,-0.000036,0.000035,-0.000038,0.000035,-0.000034,0.000033,-0.00003,0.000029,-0.000028,0.000025,-0.000023,0.000022,-0.00002,0.000018,-0.000017,0.000015,-0.000014,0.000013,-0.000012,0.000011,-0.000011,0.00001,-0.000009,0.000009,-0.000009,0.000008,-0.000008,0.000008,-0.000008,0.000007,-0.000007,0.000007,-0.000007,0.000006,-0.000006,0.000006,-0.000006,0.000006,-0.000005,0.000006,-0.000006,0.000005,-0.000005,0.000005,-0.000005,0.000005,-0.000005,0.000005,-0.000005,0.000004,-0.000004,0.000004,-0.000005,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000003,0.000004,-0.000004,0.000003,-0.000003,0.000003,-0.000004,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000002,0.000003,-0.000003,0.000003,-0.000002,0.000003,-0.000003,0.000002,-0.000002,0.000002,-0.000003,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000001,0.000002,-0.000002,0.000002,-0.000001,0.000002,-0.000002,0.000002,-0.000001,0.000002,-0.000002,0.000001,-0.000001,0.000002,-0.000002,0.000001,-0.000001,0.000001,-0.000002,0.000001,-0.000001,0.000001,-0.000002,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0,0,0.000001,-0.000001,0,0,0,-0.000001,0,0,0,-0.000001,0,0,0,-0.000001,0,0,0,-0.000001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.147621,-0.000001,0.000007,-0.00001,0.000005,-0.000006,0.000009,0,0.000008,-0.000001,0.000014,-0.000008,0.000003,-0.000009,0.000009,-0.000005,0.000002,-0.000007,0.000005,-0.000005,0.000005,-0.000023,0.000037,-0.000021,0.000022,-0.000006,0.000005,-0.000004,0.000014,-0.000007,0.000012,-0.000004,0.000002,-0.00001,0.000005,-0.000004,0.000003,-0.000001,0.000002,-0.000002,0.000005,-0.000003,0.000005,-0.000008,0.000002,-0.000002,0.000001,-0.000001,0.000001,-0.000001,0.000002,-0.000003,0,-0.000002,0,-0.000001,0.000001,0,0,0,0,0,0,0,0,0,0.000001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.000001,-0.000001,0,0,0,-0.000001,0,0,0,0,0,-0.000002,0.000002,0,0,0,0.000001,0,0,0,0,0,0,-0.000001,0.000001,0,0.000001,0,0,-0.000001,0,-0.000001,0,-0.000001,0,-0.000001,0,0,0.000001,0,0,0,0.000001,0,0.000001,-0.000001,0.000001,-0.000001,0,-0.000001,0.000001,0,0,-0.000001,0,-0.000001,0,-0.000004,0.000004,0,0.000001,-0.000001,0,-0.000001,0.000002,-0.000001,0.000002,0,0.000001,0,0.000002,-0.000001,0,0,0,-0.000001,0,0,0.000001,-0.000001,0,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0,0,0,0,0,0,0,0,0.000001,0,0,0,0,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0,0,0.000001,-0.000001,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0,-0.000001,0,0,0,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0,0,0.000001,0,0,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000002,0.000001,-0.000001,0.000001,-0.000002,0,-0.000002,0.000004,-0.000002,0.000003,-0.000002,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000004,0.000004,-0.000003,0.000003,-0.000003,0.000003,-0.000003,0.000003,-0.000002,0.000002,-0.000002,0.000002,-0.000002,0.000002,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0.000001,0,0.000001,-0.000001,0,0,0.000001,-0.000001,0,0,0,-0.000001,0,0,0,-0.000001,0,0,0,-0.000001,0,0,0,-0.000001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]};
    const trombone = {"real":[0,0.171738,0.131907,-0.1948,-0.129913,-0.081043,0.049213,0.027828,-0.008357,-0.005044,0.002145,0.000773,-0.001392,-0.000916,-0.000012,0.000323,-0.000003,0.000127,-0.000135,-0.000029,-0.000031,0.000087,-0.000091,0.000005,-0.000026,0.000027,-0.000062,-0.000017,-0.000002,0.000002,0.000012,-0.000024,0.000011,-0.000011,-0.000001,0,0.000003,0.000006,-0.000009,-0.000002,0.000001,0.000007,0.000014,-0.000008,-0.000001,-0.000003,-0.000011,-0.000003,0.000004,-0.000002,-0.000004,0.000001,-0.000004,0.000001,0.000003,0.000001,0.000002,0.000003,-0.000001,-0.000005,0,0.000001,-0.000008,0.000001,0.000003,-0.000004,-0.000004,-0.000002,0.000003,0,-0.000002,-0.000009,0.000009,0.000024,0.000011,-0.000017,-0.000024,-0.000002,0,0.000002,0.000015,0.000022,0.000001,-0.000022,-0.000016,0.000001,0.000002,-0.000003,-0.000002,0.000001,-0.000001,0.000005,0.000001,-0.000001,-0.000001,0,-0.000001,-0.000003,-0.000001,-0.000002,0.000001,-0.000003,-0.000002,0.000004,0.000007,-0.000002,-0.000006,-0.000009,-0.000003,-0.000001,0.000001,0,0.000006,0,-0.000009,-0.000011,0.000003,0.000005,-0.000002,-0.000002,-0.000001,0.000001,0.000001,0,-0.000001,-0.000001,0.000001,0,-0.000001,0.000002,0.000001,0,0,0,-0.000001,0,0,-0.000002,-0.000001,0,0,0,0.000001,0.000001,-0.000001,-0.000001,-0.000002,0.000001,0.000002,-0.000001,-0.000004,0,0.000004,0.000005,0.000001,0,-0.000002,0,-0.000004,0.000001,0.000004,0.000007,0,-0.000004,0,0.000002,0.000001,-0.000001,0.000001,0,0,-0.000001,0,-0.000002,0.000001,0.000004,0,-0.000007,0.000002,0.00003,0.000007,-0.000035,0.000007,0.000111,0.000036,-0.000022,-0.000053,0,0.000001,-0.000004,0.000035,0.000082,0.00004,-0.000032,-0.000062,-0.000012,0.000012,-0.000008,-0.000006,0.000004,0.000006,0.000003,0.000001,0,0.000001,0,0,-0.000001,-0.000001,-0.000001,-0.000001,-0.000002,-0.000002,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,-0.000001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,-0.090905,0.482287,0.259485,0.009402,-0.125271,-0.046816,0.007872,0.001762,-0.010488,-0.002305,0.001791,0.001101,-0.000303,-0.000064,0.000143,0.000059,0.000116,0.00012,-0.000011,-0.000066,-0.000019,0.000024,0.000014,0.000069,0.000056,0.000005,0.000002,-0.000026,-0.000015,0.000055,0.000012,0.000046,-0.000007,0.000007,-0.000003,-0.000007,0.000002,-0.000003,-0.00001,-0.000011,-0.000004,0.000003,0.000001,0.000005,-0.000001,-0.000004,0.000001,0.000001,0.000001,0.000004,0,-0.000001,0.000001,0.000004,-0.000001,-0.000002,0,-0.000003,-0.000004,0.000003,-0.000007,0,0.000001,0.000003,0.000002,0,-0.000001,0,0.000001,0.000006,-0.000008,-0.000016,0.000013,0.000017,0.000013,0.000001,0,-0.000002,-0.000001,-0.000004,0.000007,0.000016,0.000021,-0.000008,-0.000013,0.000003,0.000006,-0.000001,0.000001,0.000002,0,0.000001,-0.000001,0.000001,0,0,-0.000004,0.000002,0,0.000001,0.000002,-0.000001,-0.000005,0.000004,0.000014,0.000005,-0.000006,-0.000007,-0.000001,-0.000001,0,0.000009,0.000009,0.000001,-0.000006,-0.000008,0.000001,0.000002,-0.000001,-0.000002,0,0.000001,0.000001,0,0,0.000002,-0.000002,0,-0.000001,0,0,-0.000001,-0.000001,0,0,0.000001,0,0,-0.000001,0,0,0,0,0.000001,0.000001,-0.000002,-0.000003,-0.000001,0.000002,-0.000001,-0.000007,-0.000002,0.000002,0.000004,0,0.000001,0.000001,-0.000002,-0.000006,-0.000002,0.000003,0.000006,0.000001,0,0,0.000002,-0.000001,-0.000001,-0.000001,0.000001,0,0,-0.000001,0,0.000003,0.000008,0.000001,-0.00001,-0.000006,0.000015,-0.000026,-0.000075,-0.00001,0.00005,0.000082,0.000023,-0.000004,0,-0.000002,-0.000045,-0.000002,0.000041,0.000093,-0.000009,-0.000034,0.000008,0.00002,-0.000001,-0.000006,-0.000001,0,-0.000002,-0.000004,-0.000003,-0.000003,-0.000002,-0.000003,-0.000002,-0.000002,-0.000002,-0.000001,-0.000001,-0.000001,-0.000001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]};
    const brass = {"real":[0,-0.051411,-0.085181,-0.45332,-0.042603,0.04083,-0.204758,0.02603,-0.147721,-0.007584,-0.07638,-0.003137,-0.064948,0.003745,0.120424,-0.002757,0.016572,0.001757,0.005585,0.001412,-0.011589,-0.001676,-0.010206,-0.005745,0.002632,-0.001359,-0.001483,-0.003481,-0.005393,0.003601,0.004419,-0.002671,0.001664,0.001878,-0.003127,-0.003645,-0.002282,0.00249,0.000949,0.002633,0.000153,-0.000786,-0.000054,0.00141,0.001927,-0.001851,0.000077,0.001024,-0.000413,-0.001542,0.001697,0.00068,-0.001677,-0.000879,0.001588,-0.001163,-0.001416,0.001599,0.001367,-0.001552,-0.001309,0.001185,0.001161,0.001016,-0.001293,-0.000196,0.000959,-0.000821,0.001153,0.001188,0.001041,0.000318,-0.001352,0.001337,0.001352,-0.001001,-0.000867,-0.000503,0.00075,-0.00049,0.001242,-0.000144,0.000558,0.001006,0.000314,-0.001167,0.001112,0.000935,0.000987,0.000888,-0.001061,-0.000059,0.001039,0.001154,0.000665,0.001027,-0.001083,0.001052,0.000776,0.000295,-0.000945,0.000866,0.000894,0.000694,-0.000524,0.000199,0.001024,-0.000996,-0.000056,0.001027,0.000764,0.000793,-0.000985,0.000179,0.000968,0.000549,-0.000967,0.000655,-0.000677,-0.000977,0.000936,-0.000254,-0.000167,0.000703,0.000134,-0.000266,-0.000774,-0.000891,0.000514,0.000874,0.00071,0.000771,0.000837,-0.00025,0.00048,0.000178,-0.000902,0.00075,0.000911,0.000907,-0.000625,0.000592,0.000491,0.000866,0.000511,-0.000084,0.000799,0.000597,0.000879,0.000869,0.000822,0.000618,-0.00007,-0.000006,0.000857,0.000695,-0.000365,0.00055,0.000638,0.000077,-0.000568,0.00071,0.000839,0.000761,0.000202,0.000632,-0.00065,-0.000464,0.000665,0.000825,-0.000102,0.000763,0.0004,0.000587,-0.000623,0.00078,-0.000363,0.000494,0.000198,0.000797,0.000797,0.000726,0.00044,0.000572,0.00073,0.000789,0.000294,0.000721,0.000679,-0.000756,-0.000439,0.000544,0.000088,0.00082,0.000736,0.000641,0.000673,0.000458,0.000783,-0.000781,-0.000762,0.000649,0.000075,0.000591,-0.00016,0.000431,-0.000469,-0.00047,-0.000557,-0.00057,-0.000559,-0.000653,-0.000726,-0.00076,-0.00076,-0.000758,-0.000773,-0.000775,-0.00077,-0.000758,-0.000768,-0.000767,-0.00076,-0.000741,-0.00076,-0.00076,-0.00075,-0.000726,-0.000752,-0.000753,-0.000739,-0.000711,-0.000744,-0.000747,-0.00073,-0.000697,-0.000737,-0.00074,-0.00072,-0.000685,-0.00073,-0.000734,-0.000712,-0.000717,-0.00077,-0.000773,-0.000748,-0.000705,-0.000763,-0.000767,-0.00074,-0.000695,-0.000757,-0.00076,-0.000732,-0.000685,-0.000751,-0.000754,-0.000725,-0.000676,-0.000745,-0.000747,-0.000717,-0.000668,-0.000739,-0.000741,-0.000711,-0.00066,-0.000733,-0.000735,-0.000704,-0.000652,-0.000728,-0.000729,-0.000698,-0.000645,-0.000723,-0.000723,-0.000692,-0.000638,-0.000718,-0.000717,-0.000686,-0.000632,-0.000713,-0.000711,-0.000681,-0.000626,-0.000708,-0.000706,-0.000676,-0.00062,-0.000703,-0.0007,-0.00067,-0.000614,-0.000698,-0.000695,-0.000665,-0.000608,-0.000694,-0.000689,-0.000661,-0.000603,-0.000689,-0.000684,-0.000658,-0.000598,-0.000685,-0.000679,-0.00065,-0.000593,-0.00068,-0.000674,-0.000648,-0.00059,-0.000677,-0.000669,-0.000644,-0.000585,-0.000672,-0.000664,-0.00064,-0.000581,-0.000668,-0.000659,-0.000635,-0.000576,-0.000664,-0.000655,-0.000633,-0.000572,-0.00066,-0.00065,-0.00063,-0.000568,-0.000657,-0.000645,-0.000626,-0.000564,-0.000653,-0.000641,-0.000621,-0.00056,-0.000649,-0.000637,-0.000619,-0.000557,-0.000646,-0.000632,-0.000614,-0.000553,-0.000642,-0.000628,-0.000611,-0.00055,-0.000639,-0.000624,-0.000608,-0.000547,-0.000635,-0.00062,-0.000606,-0.000543,-0.000632,-0.000597,-0.000584,-0.000524,-0.000609,-0.000594,-0.000581,-0.000521,-0.000606,-0.00059,-0.000578,-0.000518,-0.000603,-0.000586,-0.000576,-0.000515,-0.0006,-0.000582,-0.000573,-0.000512,-0.000597,-0.000579,-0.000569,-0.000509,-0.000594,-0.000575,-0.000567,-0.000507,-0.000591,-0.000572,-0.000565,-0.000504,-0.000588,-0.000568,-0.000562,-0.000501,-0.000585,-0.000566,-0.00056,-0.000499,-0.000582,-0.000562,-0.000557,-0.000497,-0.00058,-0.000559,-0.000555,-0.000495,-0.000577,-0.000556,-0.000553,-0.000492,-0.000574,-0.000552,-0.000549,-0.000489,-0.000572,-0.000549,-0.000547,-0.000487,-0.000569,-0.000546,-0.000546,-0.000484,-0.000566,-0.000544,-0.000543,-0.000483,-0.000564,-0.000541,-0.00054,-0.000479,-0.000561,-0.000537,-0.000541,-0.000477,-0.000559,-0.000535,-0.000537,-0.000476,-0.000556,-0.000531,-0.000537,-0.000468,-0.000553,-0.000529,-0.000542,-0.000471,-0.000551,-0.000528,-0.000528,-0.000463,-0.000467,-0.00045,-0.000454,-0.00041,-0.000469,-0.000445,-0.000453,-0.000397,-0.000467,-0.000445,-0.000451,-0.000398,-0.000465,-0.000443,-0.000448,-0.000395,-0.000463,-0.00044,-0.000447,-0.000396,-0.000461,-0.000438,-0.000445,-0.000393,-0.000459,-0.000436,-0.000444,-0.000391,-0.000457,-0.000434,-0.000442,-0.000389,-0.000456,-0.000432,-0.00044,-0.000388,-0.000454,-0.00043,-0.000439,-0.000387,-0.000452,-0.000428,-0.000438,-0.000386,-0.00045,-0.000426,-0.000435,-0.000383,-0.000449,-0.000424,-0.000434,-0.000383,-0.000447,-0.000422,-0.00043,-0.00038,-0.000445,-0.000419,-0.000431,-0.00038,-0.000443,-0.000417,-0.000435,-0.000376,-0.000442,-0.000416,-0.000427,-0.000376,-0.00044,-0.000415,-0.000424,-0.000374,-0.000438,-0.000414,-0.000425,-0.000374,-0.000437,-0.000412,-0.000423,-0.000372,-0.000435,-0.00041,-0.000422,-0.000371,-0.000434,-0.000408,-0.000421,-0.000369,-0.000432,-0.000406,-0.00042,-0.000368,-0.00043,-0.000404,-0.000418,-0.000367,-0.000429,-0.000402,-0.000417,-0.000365,-0.000427,-0.000402,-0.000415,-0.000365,-0.000426,-0.000399,-0.000415,-0.000364,-0.000424,-0.000398,-0.000412,-0.000362,-0.000423,-0.000396,-0.000411,-0.000361,-0.000421,-0.000395,-0.00041,-0.000359,-0.00042,-0.000393,-0.000409,-0.000358,-0.000419,-0.000391,-0.000408,-0.000357,-0.000417,-0.00039,-0.000407,-0.000356,-0.000416,-0.000389,-0.000405,-0.000355,-0.000414,-0.000387,-0.000404,-0.000353,-0.000413,-0.000385,-0.000402,-0.000352,-0.000412,-0.000384,-0.000401,-0.000352,-0.00041,-0.000383,-0.000401,-0.00035,-0.000409,-0.000327,-0.000342,-0.000299,-0.00035,-0.000326,-0.000342,-0.000299,-0.000349,-0.000325,-0.00034,-0.000298,-0.000347,-0.000324,-0.000339,-0.000297,-0.000346,-0.000322,-0.00034,-0.000295,-0.000345,-0.000321,-0.000336,-0.000294,-0.000344,-0.00032,-0.000335,-0.000295,-0.000343,-0.00032,-0.000335,-0.000293,-0.000342,-0.000317,-0.000336,-0.000293,-0.000341,-0.000316,-0.000333,-0.000292,-0.00034,-0.000315,-0.000333,-0.000291,-0.000339,-0.000315,-0.000333,-0.00029,-0.000338,-0.000313,-0.000331,-0.000289,-0.000337,-0.000313,-0.00033,-0.000288,-0.000336,-0.000312,-0.000329,-0.000287,-0.000335,-0.000309,-0.000328,-0.000286,-0.000334,-0.000309,-0.000327,-0.000286,-0.000333,-0.000308,-0.000326,-0.000285,-0.000332,-0.000308,-0.000325,-0.000285,-0.000331,-0.000307,-0.000324,-0.000283,-0.00033,-0.000305,-0.000323,-0.000283,-0.000329,-0.000305,-0.000322,-0.000282,-0.000328,-0.000304,-0.000322,-0.000281,-0.000327,-0.000303,-0.000321,-0.00028,-0.000326,-0.000302,-0.00032,-0.00028,-0.000325,-0.000301,-0.00032,-0.000279,-0.000324,-0.000299,-0.000319,-0.000279,-0.000324,-0.000299,-0.000318,-0.000278,-0.000323,-0.000298,-0.000317,-0.000277,-0.000322,-0.000297,-0.000316,-0.000276,-0.000321,-0.000296,-0.000315,-0.000276,-0.00032,-0.000295,-0.000314,-0.000274,-0.000319,-0.000294,-0.000314,-0.000275,-0.000318,-0.000293,-0.000314,-0.000273,-0.000318,-0.000292,-0.000313,-0.000273,-0.000317,-0.000292,-0.000312,-0.000272,-0.000316,-0.000291,-0.000311,-0.000272,-0.000315,-0.00029,-0.000309,-0.000271,-0.000314,-0.000289,-0.000311,-0.00027,-0.000313,-0.000287,-0.00031,-0.00027,-0.000313,-0.000287,-0.000307,-0.000267,-0.000312,-0.000286,-0.000308,-0.000268,-0.000311,-0.000286,-0.000306,-0.000267,-0.00031,-0.000284,-0.000306,-0.000267,-0.000309,-0.000284,-0.000305,-0.000266,-0.000309,-0.000284,-0.000304,-0.000265,-0.000308,-0.000282,-0.000304,-0.000266,-0.000307,-0.000281,-0.000302,-0.000264,-0.000306,-0.000281,-0.000302,-0.000264,-0.000306,-0.00028,-0.000302,-0.000263,-0.000305,-0.000279,-0.0003,-0.000262,-0.000304,-0.000279,-0.0003,-0.000262,-0.000303,-0.000278,-0.000299,-0.000262,-0.000303,-0.000278,-0.000299,-0.000261,-0.000302,-0.000276,-0.000298,-0.000261,-0.000301,-0.000275,-0.000297,-0.00026,-0.0003,-0.000273,-0.000297,-0.000261,-0.0003,-0.000273,-0.000298,-0.000257,-0.000299,-0.000273,-0.000296,-0.000258,-0.000298,-0.000273,-0.000294,-0.000257,-0.000298,-0.000272,-0.000293,-0.000257,-0.000297,-0.000272,-0.000294,-0.000254,-0.000296,-0.00027,-0.000293,-0.000255,-0.000295,-0.000272,-0.000292,-0.000253,-0.000295,-0.000269,-0.000292,-0.000253,-0.000294,-0.000269,-0.000291,-0.000253,-0.000294,-0.000268,-0.00029,-0.000254,-0.000293,-0.000268,-0.00029,-0.000253,-0.000292,-0.000267,-0.000289,-0.00025,-0.000292,-0.000264,-0.000289,-0.000252,-0.000291,-0.000265,-0.000286,-0.000247,-0.00029,-0.000264,-0.000289,-0.000252,-0.00029,-0.000266,-0.000282,-0.000249,-0.000288,-0.000264,-0.000285,-0.000265,-0.000288,-0.000268,-0.000283,-0.00022,-0.000254,-0.000243,-0.000252,-0.000221,-0.000254,-0.000234,-0.000253,-0.000217,-0.000253,-0.00023,-0.000249,-0.000219,-0.000253,-0.000233,-0.000246,-0.000218,-0.000252,-0.00023,-0.000249,-0.000219,-0.000252,-0.000229,-0.00025,-0.000217,-0.000251,-0.00023,-0.000249,-0.000216,-0.000251,-0.000227,-0.000248,-0.000217,-0.00025,-0.000229,-0.000248,-0.000216,-0.00025,-0.000227,-0.000248,-0.000216,-0.000249,-0.000227,-0.000245,-0.000214,-0.000249,-0.000225,-0.000247,-0.000215,-0.000248,-0.000227,-0.000246,-0.000214,-0.000248,-0.000225,-0.000246,-0.000215,-0.000247,-0.000223,-0.000244,-0.000214,-0.000246,-0.000224,-0.000244,-0.000214,-0.000246,-0.000223,-0.000245,-0.000212,-0.000246,-0.000223,-0.000244,-0.000213,-0.000245,-0.000221,-0.000243,-0.000212,-0.000244,-0.000221,-0.000243,-0.000213,-0.000244,-0.000222,-0.000242,-0.000211,-0.000244,-0.000221,-0.000241,-0.000209,-0.000243,-0.000222,-0.000241,-0.00021,-0.000243,-0.00022,-0.00024,-0.000211,-0.000242,-0.00022,-0.00024,-0.000209,-0.000242,-0.000218,-0.000241,-0.00021,-0.000241,-0.000218,-0.000239,-0.000209,-0.000241,-0.000218,-0.000238,-0.000207,-0.00024,-0.000217,-0.000238,-0.000207,-0.00024,-0.000215,-0.000239,-0.000206,-0.000239,-0.000217,-0.000235,-0.000206,-0.000239,-0.000215,-0.000238,-0.000207,-0.000238,-0.000216,-0.000236,-0.000206,-0.000238,-0.000215,-0.000236,-0.000206,-0.000237,-0.000215,-0.000236,-0.000206,-0.000237,-0.000215,-0.000235,-0.000205,-0.000237,-0.000215,-0.000235,-0.000205,-0.000236,-0.000214,-0.000234,-0.000203,-0.000236,-0.000213,-0.000234,-0.000203,-0.000235,-0.000213,-0.000234,-0.000203,-0.000235,-0.000213,-0.000233,-0.000203,-0.000234,-0.000212,-0.000233,-0.000204,-0.000234,-0.000212,-0.000232,-0.000203,-0.000233,-0.000212,-0.000232,-0.000202,-0.000233,-0.00021,-0.000232,-0.000201,-0.000233,-0.000212,-0.000231,-0.000204,-0.000232,-0.00021,-0.00023,-0.000201,-0.000232,-0.000209,-0.000231,-0.000202,-0.000231,-0.000211,-0.00023,-0.000201,-0.000231,-0.000209,-0.00023,-0.000201,-0.000231,-0.000208,-0.000229,-0.0002,-0.00023,-0.000208,-0.000229,-0.0002,-0.00023,-0.000208,-0.000228,-0.0002,-0.000229,-0.000207,-0.000228,-0.0002,-0.000229,-0.000206,-0.000227,-0.0002,-0.000229,-0.000206,-0.000228,-0.000198,-0.000228,-0.000205,-0.000227,-0.000199,-0.000228,-0.000205,-0.000227,-0.000199,-0.000227,-0.000205,-0.000226,-0.000198,-0.000227,-0.000205,-0.000226,-0.000197,-0.000227,-0.000201,-0.000226,-0.000198,-0.000226,-0.000205,-0.000225,-0.000196,-0.000226,-0.000203,-0.000224,-0.000196,-0.000225,-0.000203,-0.000225,-0.000196,-0.000225,-0.000202,-0.000224,-0.000195,-0.000225,-0.000203,-0.000224,-0.000195,-0.000224,-0.000201,-0.000223,-0.000195,-0.000224,-0.000202,-0.000223,-0.000195,-0.000223,-0.00019,-0.000209,-0.000183,-0.00021,-0.000189,-0.000209,-0.000182,-0.000209,-0.000188,-0.000209,-0.000182,-0.000209,-0.000188,-0.000208,-0.000182,-0.000209,-0.000187,-0.000208,-0.000182,-0.000208,-0.000188,-0.000207,-0.000181,-0.000208,-0.000188,-0.000207,-0.000181,-0.000208,-0.000186,-0.000207,-0.00018,-0.000207,-0.000187,-0.000207,-0.000181,-0.000207,-0.000185,-0.000206,-0.000181,-0.000207,-0.000185,-0.000206,-0.000179,-0.000206,-0.000186,-0.000205,-0.00018,-0.000206,-0.000185,-0.000205,-0.000179,-0.000206,-0.000185,-0.000205,-0.000178,-0.000205,-0.000185,-0.000204,-0.000179,-0.000205,-0.000184,-0.000204,-0.000178,-0.000205,-0.000183,-0.000204,-0.000179,-0.000204,-0.000184,-0.000204,-0.000177,-0.000204,-0.000183,-0.000203,-0.000177,-0.000204,-0.000183,-0.000203,-0.000177,-0.000203,-0.000183,-0.000202,-0.000177,-0.000203,-0.000183,-0.000202,-0.000179,-0.000203,-0.000182,-0.000202,-0.000176,-0.000202,-0.000181,-0.000202,-0.000177,-0.000202,-0.000184,-0.000201,-0.000176,-0.000202,-0.00018,-0.000201,-0.000176,-0.000201,-0.000181,-0.0002,-0.000175,-0.000201,-0.000181,-0.000199,-0.000174,-0.000201,-0.000179,-0.0002,-0.000174,-0.000201,-0.000181,-0.0002,-0.000175,-0.0002,-0.000181,-0.000199,-0.000174,-0.0002,-0.000181,-0.000198,-0.000173,-0.0002,-0.000178,-0.000199,-0.000174,-0.000199,-0.000179,-0.000198,-0.000174,-0.000199,-0.000181,-0.000198,-0.000174,-0.000199,-0.000179,-0.000198,-0.000173,-0.000198,-0.000177,-0.000198,-0.000174,-0.000198,-0.000176,-0.000198,-0.000173,-0.000198,-0.000176,-0.000197,-0.000173,-0.000198,-0.000176,-0.000197,-0.000174,-0.000197,-0.000176,-0.000196,-0.000172,-0.000197,-0.000176,-0.000197,-0.000171,-0.000197,-0.000176,-0.000196,-0.000168,-0.000196,-0.000182,-0.000196,-0.000171,-0.000196,-0.000174,-0.000196,-0.000173,-0.000196,-0.000176,-0.000191,-0.000172,-0.000196,-0.000171,-0.000194,-0.000171,-0.000195,-0.000176,-0.000195,-0.000169,-0.000195,-0.000174,-0.000194,-0.000166,-0.000195,-0.000174,-0.000194,-0.000168,-0.000194,-0.00017,-0.000194,-0.000169,-0.000194,-0.000174,-0.000193,-0.000169,-0.000194,-0.000174,-0.000193,-0.000169,-0.000194,-0.000173,-0.000192,-0.000168,-0.000193,-0.000175,-0.000192,-0.000167,-0.000193,-0.000173,-0.000192,-0.000167,-0.000193,-0.000171,-0.000191,-0.000167,-0.000192,-0.000173,-0.000192,-0.000171,-0.000192,-0.000172,-0.000191,-0.000167,-0.000192,-0.000171,-0.000191,-0.000168,-0.000192,-0.000171,-0.000191,-0.000167,-0.000191,-0.000171,-0.000191,-0.000167,-0.000191,-0.000171,-0.000191,-0.000166,-0.000191,-0.00017,-0.00019,-0.000167,-0.000191,-0.000171,-0.00019,-0.000166,-0.00019,-0.00017,-0.00019,-0.000165,-0.00019,-0.00017,-0.00019,-0.000166,-0.00019,-0.00015,-0.000167,-0.000146,-0.000168,-0.000151,-0.000167,-0.000146,-0.000167,-0.00015,-0.000167,-0.000148,-0.000167,-0.00015,-0.000167,-0.000147,-0.000167,-0.000149,-0.000167,-0.000147,-0.000167,-0.000149,-0.000166,-0.000146,-0.000167,-0.000149,-0.000166,-0.000144,-0.000166,-0.000148,-0.000166,-0.000146,-0.000166,-0.000148,-0.000165,-0.000145,-0.000166,-0.000148,-0.000166,-0.000146,-0.000166,-0.000149,-0.000165,-0.000145,-0.000165,-0.000145,-0.000165,-0.000145,-0.000165,-0.000148,-0.000165,-0.000145,-0.000165,-0.000145,-0.000165,-0.000144,-0.000165,-0.000148,-0.000164,-0.000145,-0.000165,-0.000147,-0.000164,-0.000144,-0.000164,-0.000147,-0.000164,-0.000145,-0.000164,-0.000148,-0.000164,-0.000143,-0.000164,-0.000147,-0.000163,-0.000144,-0.000164,-0.000146,-0.000163,-0.000144,-0.000163,-0.000145,-0.000163,-0.000142,-0.000163,-0.000148,-0.000163,-0.000142,-0.000163,-0.000144,-0.000163,-0.00014,-0.000163,-0.000145,-0.000162,-0.000142,-0.000163,-0.000144,-0.000162,-0.000142,-0.000162,-0.000145,-0.000162,-0.000141,-0.000162,-0.000145,-0.000162,-0.000142,-0.000162,-0.000144,-0.000162,-0.000142,-0.000162,-0.000145,-0.000162,-0.000143,-0.000162,-0.000144,-0.000161,-0.000141,-0.000161,-0.000144,-0.000161,-0.000143,-0.000161,-0.000144,-0.000161,-0.000141,-0.000161,-0.000143,-0.000161,-0.000142,-0.000161,-0.000143,-0.000161,-0.00014,-0.000161,-0.000142,-0.00016,-0.000141,-0.00016,-0.000143,-0.00016,-0.000141,-0.00016,-0.000143,-0.00016,-0.00014,-0.00016,-0.000145,-0.000159,-0.000141,-0.00016,-0.000143,-0.000159,-0.000139,-0.00016,-0.000143,-0.000159,-0.000139,-0.000159,-0.000141,-0.000159,-0.000139,-0.000159,-0.000143,-0.000159,-0.000139,-0.000159,-0.000141,-0.000159,-0.00014,-0.000159,-0.00014,-0.000158,-0.000138,-0.000159,-0.000141,-0.000158,-0.000138,-0.000158,-0.000143,-0.000158,-0.000139,-0.000158,-0.000141,-0.000158,-0.000137,-0.000158,-0.000142,-0.000158,-0.000138,-0.000158,-0.000141,-0.000157,-0.000138,-0.000158,-0.00014,-0.000157,-0.000138,-0.000157,-0.000139,-0.000157,-0.000138,-0.000157,-0.000141,-0.000157,-0.000139,-0.000157,-0.000139,-0.000156,-0.000139,-0.000157,-0.000138,-0.000157,-0.000137,-0.000157,-0.000138,-0.000156,-0.000137,-0.000156,-0.000139,-0.000156,-0.000138,-0.000156,-0.000139,-0.000156,-0.000137,-0.000156,-0.000139,-0.000156,-0.000138,-0.000156,-0.000139,-0.000155,-0.000136,-0.000156,-0.000138,-0.000156,-0.000136,-0.000155,-0.000139,-0.000155,-0.000137,-0.000155,-0.000139,-0.000155,-0.000136,-0.000155,-0.000138,-0.000155,-0.000138,-0.000155,-0.000139,-0.000155,-0.000136,-0.000155,-0.000138,-0.000155,-0.000137,-0.000155,-0.000137,-0.000154,-0.000136,-0.000154,-0.000137,-0.000154,-0.000135,-0.000154,-0.000137,-0.000154,-0.000135,-0.000154,-0.000137,-0.000154,-0.000134,-0.000154,-0.000136,-0.000154,-0.000135,-0.000154,-0.000137,-0.000154,-0.000136,-0.000154,-0.000136,-0.000153,-0.000135,-0.000153,-0.000137,-0.000153,-0.000135,-0.000153,-0.000136,-0.000153,-0.000134,-0.000153,-0.000136,-0.000153,-0.000134,-0.000153,-0.000137,-0.000153,-0.000133,-0.000153,-0.000136,-0.000153,-0.000134,-0.000153,-0.000135,-0.000152,-0.000133,-0.000152,-0.000135,-0.000152,-0.000134,-0.000152,-0.000134,-0.000152,-0.000134,-0.000152,-0.000135,-0.000152,-0.000134,-0.000152,-0.000134,-0.000152,-0.000134,-0.000152,-0.000135,-0.000151,-0.000131,-0.000151,-0.000134,-0.000151,-0.000134,-0.000151,-0.000136,-0.000151,-0.000134,-0.000151,-0.000136,-0.000151,-0.000134,-0.000151,-0.000133,-0.000151,-0.000133,-0.000151,-0.000134,-0.000151,-0.000133,-0.000151,-0.000133,-0.00015,-0.000132,-0.00015,-0.000132,-0.00015,-0.000134,-0.00015,-0.000125,-0.000149,-0.000135,-0.00015,-0.000131,-0.00015,-0.000135,-0.00015,-0.000132,-0.00015,-0.000132,-0.00015,-0.000133,-0.00015,-0.000133,-0.00015,-0.000131,-0.000149,-0.000132,-0.000149,-0.000134,-0.000149,-0.000131,-0.000149,-0.000133,-0.000149,-0.000131,-0.000149,-0.000135,-0.000149,-0.000133,-0.000149,-0.000133,-0.000149,-0.00013,-0.000149,-0.000131,-0.000149,-0.000131,-0.000149,-0.000131,-0.000148,-0.00013,-0.000148,-0.000133,-0.000148,-0.00013,-0.000148,-0.000132,-0.000148,-0.000129,-0.000148,-0.000132,-0.000148,-0.00013,-0.000148,-0.000131,-0.000148,-0.00013,-0.000148,-0.000131,-0.000148,-0.000131,-0.000148,-0.000123,-0.000139,-0.000124,-0.000139,-0.000125,-0.000139,-0.000123,-0.000139,-0.000123,-0.000139,-0.000122,-0.000138,-0.00012,-0.000138,-0.000123,-0.000138,-0.000124,-0.000138,-0.000123,-0.000138,-0.000123,-0.000138,-0.000122,-0.000138,-0.000123,-0.000138,-0.000121,-0.000138,-0.000123,-0.000138,-0.000122,-0.000138,-0.000122,-0.000137,-0.000123,-0.000138,-0.000122,-0.000137,-0.000121,-0.000137,-0.000122,-0.000137,-0.000121,-0.000137,-0.000121,-0.000137,-0.000121,-0.000137,-0.000122,-0.000137,-0.000122,-0.000137,-0.000123,-0.000137,-0.000121,-0.000137,-0.000121,-0.000137,-0.000121,-0.000137,-0.000121,-0.000137,-0.00012,-0.000137,-0.000122,-0.000136,-0.000121,-0.000136,-0.000121,-0.000136,-0.00012,-0.000136,-0.00012,-0.000136,-0.00012,-0.000136,-0.000121,-0.000136,-0.000119,-0.000136,-0.00012,-0.000136,-0.00012,-0.000136,-0.000121,-0.000136,-0.00012,-0.000136,-0.000121,-0.000136,-0.00012,-0.000136,-0.000121,-0.000136,-0.000119,-0.000136,-0.00012,-0.000135,-0.00012,-0.000135,-0.00012,-0.000135,-0.00012,-0.000135,-0.000119,-0.000135,-0.000119,-0.000135,-0.000119,-0.000135,-0.00012,-0.000135,-0.00012,-0.000135,-0.00012,-0.000135,-0.000119,-0.000135,-0.00012,-0.000135,-0.000119,-0.000135,-0.000118,-0.000135,-0.00012,-0.000134,-0.000119,-0.000134,-0.00012,-0.000134,-0.000119,-0.000134,-0.000119,-0.000134,-0.000119,-0.000134,-0.000119,-0.000134,-0.000119,-0.000134,-0.000118,-0.000134,-0.000118,-0.000134,-0.000119,-0.000134,-0.000117,-0.000134,-0.000118,-0.000134,-0.000118,-0.000134,-0.000117,-0.000134,-0.000118,-0.000133,-0.000118,-0.000133,-0.000119,-0.000133,-0.000118,-0.000133,-0.000118,-0.000133,-0.000118,-0.000133,-0.000119,-0.000133,-0.000117,-0.000133,-0.000115,-0.000133,-0.000111,-0.000133,-0.000115],"imag":[0,0.123894,0.15737,0.210952,-0.07615,-0.145613,-0.004471,-0.011613,0.068694,0.033905,0.119128,-0.001508,-0.005879,0.004987,-0.012356,-0.002032,0.002838,0.00564,0.016947,0.003254,0.012119,0.001022,0.001041,-0.006764,0.006971,0.006519,0.00636,-0.005381,0.001966,0.003007,0.000692,-0.003329,-0.003718,0.003545,0.00201,-0.000368,-0.002096,0.001772,0.002863,0.000002,-0.002596,0.002207,0.002314,-0.001802,-0.0009,0.000999,0.002079,0.001643,-0.00187,0.001103,0.000801,0.00173,-0.000759,0.001411,-0.000436,0.001145,-0.000783,0.000123,-0.000812,0.000273,-0.000854,0.000925,-0.000936,-0.001076,0.000695,0.001443,0.001081,0.001177,-0.000836,-0.000766,-0.000941,0.001357,0.000295,0.000319,0.000193,-0.000853,-0.000977,0.001197,-0.00105,-0.001184,-0.000282,0.001258,0.001128,-0.000743,-0.001203,0.000408,-0.000523,-0.000786,-0.000708,-0.000819,-0.000563,-0.001193,0.000575,-0.000254,-0.000883,-0.000393,0.00015,0.000278,-0.000755,-0.001036,0.000505,0.000622,0.000572,-0.000796,-0.000911,0.001027,0.000188,0.000287,0.00103,-0.000007,-0.000679,-0.000637,-0.000238,0.000992,0.000265,-0.000835,0.000238,0.000743,0.000718,0.00011,-0.000285,0.000941,-0.000956,0.000664,-0.000953,0.000921,0.00056,-0.000334,0.000796,0.000358,-0.000616,-0.000532,0.000413,0.000896,0.000792,-0.000906,0.000177,-0.000526,0.000062,-0.000074,-0.000657,-0.000682,0.000754,0.000233,-0.000733,-0.000887,-0.000387,-0.000653,-0.000071,0.000132,-0.000301,-0.000616,-0.000867,-0.000867,-0.000111,-0.000509,-0.000777,-0.000656,0.000567,-0.000847,-0.00063,-0.000458,-0.000078,0.000355,0.000813,-0.000546,-0.00052,-0.000688,-0.000492,-0.000013,-0.000816,0.000302,0.000713,-0.000567,0.000523,0.000223,0.000722,-0.000637,-0.000779,-0.000085,0.000069,-0.000329,-0.000663,-0.00055,-0.000304,0.000003,-0.00073,0.00031,-0.000389,-0.000343,-0.000701,-0.000621,-0.000819,0.000044,-0.00036,0.000507,0.00046,0.000671,0.00021,-0.000212,-0.000265,-0.000476,-0.000799,-0.000541,-0.000783,-0.00067,-0.000642,-0.000639,-0.000562,-0.000546,-0.000555,-0.000437,-0.000294,-0.000183,-0.000175,-0.000178,-0.000076,0.00001,-0.000071,-0.000143,-0.000044,0.000041,-0.000093,-0.000185,-0.000064,0.000037,-0.00012,-0.000218,-0.000077,0.000038,-0.00014,-0.000242,-0.000086,0.00004,-0.000155,-0.00026,-0.000093,0.000043,-0.000168,-0.000275,-0.000097,0.000048,-0.000178,-0.000304,-0.000106,0.000056,-0.000197,-0.000314,-0.000108,0.000061,-0.000204,-0.000322,-0.000109,0.000067,-0.000211,-0.000329,-0.00011,0.000072,-0.000214,-0.000334,-0.00011,0.000077,-0.000218,-0.000338,-0.00011,0.000082,-0.000221,-0.000341,-0.000109,0.000087,-0.000224,-0.000344,-0.000108,0.000092,-0.000225,-0.000346,-0.000107,0.000096,-0.000226,-0.000348,-0.000106,0.000101,-0.000227,-0.000349,-0.000105,0.000105,-0.000228,-0.000349,-0.000103,0.000109,-0.000227,-0.00035,-0.000103,0.000113,-0.000228,-0.00035,-0.000101,0.000116,-0.000228,-0.000351,-0.000101,0.00012,-0.000227,-0.00035,-0.000098,0.000123,-0.00022,-0.00035,-0.000097,0.000126,-0.00023,-0.000349,-0.000097,0.00013,-0.000224,-0.000346,-0.000093,0.000131,-0.000222,-0.000347,-0.000092,0.000135,-0.00022,-0.000345,-0.000091,0.000137,-0.000221,-0.000345,-0.00009,0.00014,-0.000214,-0.000344,-0.00009,0.000143,-0.000211,-0.000343,-0.000086,0.000145,-0.000211,-0.000341,-0.000085,0.000146,-0.000213,-0.00034,-0.000084,0.000148,-0.000208,-0.000338,-0.000083,0.00015,-0.000209,-0.000337,-0.000081,0.000152,-0.000207,-0.000336,-0.00008,0.000154,-0.000206,-0.000334,-0.000079,0.000155,-0.000202,-0.000334,-0.000078,0.000153,-0.000194,-0.000322,-0.000074,0.000154,-0.000194,-0.00032,-0.000073,0.000155,-0.000191,-0.000319,-0.000072,0.000157,-0.000188,-0.000318,-0.00007,0.00016,-0.000185,-0.000316,-0.00007,0.000159,-0.000188,-0.000316,-0.000068,0.00016,-0.000184,-0.000313,-0.000068,0.00016,-0.000182,-0.000312,-0.000067,0.000163,-0.00018,-0.000311,-0.000065,0.000162,-0.000178,-0.00031,-0.000065,0.000164,-0.000176,-0.000307,-0.000063,0.000165,-0.000175,-0.000305,-0.000062,0.000166,-0.000173,-0.000304,-0.000061,0.000167,-0.000173,-0.000303,-0.000059,0.000168,-0.000171,-0.000302,-0.00006,0.000168,-0.000168,-0.000302,-0.00006,0.000168,-0.000167,-0.000297,-0.00006,0.000166,-0.000169,-0.000299,-0.000058,0.00017,-0.000157,-0.000297,-0.000057,0.000168,-0.00016,-0.000294,-0.000054,0.000172,-0.00015,-0.000303,-0.00006,0.000171,-0.00012,-0.000293,-0.00006,0.000166,-0.000164,-0.000301,-0.000074,0.000144,-0.000131,-0.000233,-0.000046,0.000154,-0.000127,-0.000251,-0.000044,0.000148,-0.000126,-0.000245,-0.000042,0.000148,-0.000128,-0.000246,-0.000043,0.00015,-0.000126,-0.000241,-0.000043,0.000149,-0.000125,-0.000242,-0.000043,0.000148,-0.000122,-0.000242,-0.000042,0.000149,-0.000123,-0.000241,-0.000041,0.00015,-0.000123,-0.000239,-0.000039,0.000149,-0.000119,-0.000238,-0.000039,0.000149,-0.000117,-0.000236,-0.00004,0.00015,-0.00012,-0.000237,-0.000038,0.000151,-0.000115,-0.000234,-0.000038,0.00015,-0.000123,-0.000235,-0.000039,0.000154,-0.000115,-0.000233,-0.000036,0.000153,-0.00009,-0.000235,-0.000039,0.000152,-0.000117,-0.000233,-0.000038,0.000151,-0.000119,-0.000232,-0.000039,0.000148,-0.000111,-0.00023,-0.000037,0.000149,-0.000111,-0.000229,-0.000037,0.00015,-0.00011,-0.000228,-0.000036,0.000149,-0.000107,-0.000227,-0.000034,0.00015,-0.000105,-0.000227,-0.000035,0.000152,-0.000105,-0.000225,-0.000033,0.000151,-0.000104,-0.000225,-0.000034,0.000148,-0.000104,-0.000223,-0.000033,0.000151,-0.000099,-0.000222,-0.000033,0.00015,-0.000104,-0.000222,-0.000032,0.000151,-0.0001,-0.000221,-0.000032,0.000149,-0.000101,-0.000221,-0.000032,0.000151,-0.000098,-0.00022,-0.000032,0.000151,-0.000098,-0.000219,-0.000032,0.000151,-0.000095,-0.000218,-0.000031,0.00015,-0.000096,-0.000216,-0.00003,0.000149,-0.000096,-0.000216,-0.00003,0.00015,-0.000096,-0.000216,-0.00003,0.00015,-0.000096,-0.000214,-0.00003,0.000149,-0.00009,-0.000214,-0.00003,0.000128,-0.00008,-0.000183,-0.000025,0.000128,-0.000076,-0.000182,-0.000025,0.000128,-0.000078,-0.000181,-0.000025,0.000128,-0.000075,-0.00018,-0.000024,0.000128,-0.000067,-0.000181,-0.000025,0.000127,-0.000079,-0.000181,-0.000025,0.000129,-0.000078,-0.000177,-0.000024,0.000125,-0.000076,-0.000178,-0.000023,0.000129,-0.000067,-0.000177,-0.000023,0.000129,-0.000074,-0.000176,-0.000023,0.000128,-0.000072,-0.000175,-0.000024,0.000126,-0.000066,-0.000176,-0.000021,0.000127,-0.00007,-0.000176,-0.000022,0.000126,-0.000069,-0.000175,-0.000021,0.000127,-0.00007,-0.000175,-0.000022,0.00013,-0.000068,-0.000174,-0.000022,0.000128,-0.000067,-0.000172,-0.00002,0.000126,-0.000068,-0.000172,-0.000021,0.000126,-0.000067,-0.000171,-0.000021,0.000125,-0.000068,-0.000171,-0.000021,0.000127,-0.000067,-0.00017,-0.00002,0.000125,-0.000069,-0.00017,-0.00002,0.000126,-0.000065,-0.00017,-0.000021,0.000126,-0.000066,-0.000169,-0.000019,0.000126,-0.000063,-0.000167,-0.000019,0.000124,-0.000061,-0.000168,-0.00002,0.000126,-0.000062,-0.000165,-0.000019,0.000125,-0.000062,-0.000166,-0.000019,0.000126,-0.000063,-0.000166,-0.000018,0.000125,-0.000059,-0.000166,-0.000019,0.000125,-0.00006,-0.000164,-0.000018,0.000125,-0.000061,-0.000165,-0.000019,0.000126,-0.00006,-0.000163,-0.000017,0.000126,-0.000056,-0.000164,-0.000017,0.000125,-0.000055,-0.000162,-0.000018,0.000124,-0.000055,-0.000161,-0.000017,0.000123,-0.000057,-0.00016,-0.000017,0.000124,-0.000059,-0.00016,-0.000017,0.000123,-0.000046,-0.000161,-0.000016,0.000127,-0.000049,-0.000159,-0.000016,0.000124,-0.000058,-0.000162,-0.000016,0.000124,-0.000051,-0.000159,-0.000016,0.000122,-0.000055,-0.000158,-0.000017,0.000125,-0.000053,-0.000157,-0.000016,0.000123,-0.000052,-0.000157,-0.000016,0.000122,-0.000055,-0.000157,-0.000017,0.000123,-0.00005,-0.000155,-0.000015,0.000125,-0.000053,-0.000157,-0.000016,0.000123,-0.000049,-0.000156,-0.000014,0.000123,-0.000049,-0.000155,-0.000016,0.000124,-0.000054,-0.000155,-0.000015,0.000121,-0.000049,-0.000155,-0.000015,0.000122,-0.00005,-0.000153,-0.000014,0.00012,-0.000048,-0.000154,-0.000014,0.000122,-0.000045,-0.000151,-0.000013,0.000123,-0.000048,-0.000152,-0.000015,0.000125,-0.000045,-0.000148,-0.000013,0.000124,-0.000035,-0.000154,-0.000015,0.000123,-0.000042,-0.00015,-0.000014,0.000121,-0.000049,-0.00015,-0.000013,0.000122,-0.000049,-0.00015,-0.000013,0.00012,-0.00004,-0.000153,-0.000014,0.000122,-0.000043,-0.000151,-0.000015,0.000116,-0.000048,-0.000152,-0.000014,0.00012,-0.000043,-0.00015,-0.000015,0.00012,-0.000045,-0.00015,-0.000012,0.00012,-0.000044,-0.000147,-0.000012,0.000119,-0.00004,-0.000148,-0.00001,0.00012,-0.000042,-0.000151,-0.000014,0.000124,-0.000038,-0.000146,-0.000011,0.000119,-0.000055,-0.000154,-0.000015,0.000121,-0.000025,-0.000144,-0.000014,0.000115,-0.000067,-0.000148,-0.000024,0.000118,-0.000045,-0.000116,-0.000014,0.000107,-0.000052,-0.000129,-0.000015,0.000076,-0.000038,-0.000126,-0.000005,0.0001,-0.000023,-0.000131,-0.000013,0.000106,-0.000046,-0.000126,-0.000013,0.000099,-0.000057,-0.000128,-0.000008,0.000105,-0.000042,-0.000125,-0.000007,0.000104,-0.000028,-0.000127,-0.00001,0.000102,-0.000033,-0.000129,-0.000008,0.000106,-0.000033,-0.000126,-0.000011,0.000102,-0.000031,-0.000125,-0.000012,0.000103,-0.000025,-0.000125,-0.000011,0.000103,-0.000042,-0.000128,-0.000011,0.000105,-0.000031,-0.000124,-0.000009,0.000101,-0.000031,-0.000125,-0.00001,0.000104,-0.000029,-0.000123,-0.000009,0.000107,-0.00004,-0.000123,-0.00001,0.000104,-0.000032,-0.000123,-0.00001,0.000103,-0.000026,-0.000124,-0.000008,0.000103,-0.000031,-0.000122,-0.00001,0.000105,-0.000034,-0.000122,-0.00001,0.000105,-0.00003,-0.00012,-0.00001,0.000102,-0.000033,-0.000122,-0.000009,0.000102,-0.000031,-0.000125,-0.000009,0.0001,-0.000034,-0.000122,-0.00001,0.000102,-0.000035,-0.00012,-0.000008,0.000102,-0.000027,-0.000122,-0.000009,0.000104,-0.000022,-0.000119,-0.00001,0.000102,-0.000031,-0.00012,-0.000007,0.000102,-0.000033,-0.000122,-0.00001,0.000104,-0.000032,-0.000122,-0.000009,0.000106,-0.000022,-0.000122,-0.000009,0.000101,-0.000047,-0.000121,-0.000011,0.000103,-0.000023,-0.000119,-0.000007,0.0001,-0.000034,-0.000119,-0.000009,0.000102,-0.000028,-0.000119,-0.000008,0.000101,-0.000029,-0.000118,-0.000008,0.000099,-0.000028,-0.000118,-0.000009,0.000099,-0.000028,-0.000117,-0.000008,0.000101,-0.000027,-0.000121,-0.000009,0.000101,-0.00003,-0.000119,-0.000007,0.000101,-0.000027,-0.000118,-0.000009,0.000099,-0.000025,-0.000118,-0.000008,0.0001,-0.000027,-0.000116,-0.000009,0.0001,-0.00003,-0.000116,-0.000009,0.000097,-0.000027,-0.000116,-0.000007,0.000101,-0.000024,-0.000117,-0.000008,0.000097,-0.000025,-0.000111,-0.000009,0.000098,-0.00003,-0.000115,-0.000009,0.0001,-0.000023,-0.000114,-0.000006,0.000096,-0.000024,-0.000114,-0.000007,0.000099,-0.000023,-0.000114,-0.000007,0.0001,-0.000028,-0.000114,-0.000007,0.000098,-0.000022,-0.000113,-0.000007,0.000098,-0.000023,-0.000112,-0.000008,0.000098,-0.000025,-0.000112,-0.000007,0.000099,-0.000025,-0.000112,-0.000006,0.000098,-0.000019,-0.000114,-0.000007,0.0001,-0.000019,-0.000112,-0.000007,0.000099,-0.00002,-0.00011,-0.000006,0.000098,-0.000024,-0.000111,-0.000007,0.000097,-0.000021,-0.000112,-0.000005,0.000104,-0.000019,-0.00011,-0.000007,0.000095,-0.000022,-0.000112,-0.000008,0.000099,-0.000023,-0.000112,-0.000008,0.000097,-0.000016,-0.00011,-0.000007,0.000099,-0.000022,-0.000111,-0.000005,0.000097,-0.00002,-0.000111,-0.000005,0.000098,-0.000023,-0.00011,-0.000006,0.000097,-0.000021,-0.00011,-0.000006,0.00009,-0.000019,-0.000103,-0.000005,0.000091,-0.000018,-0.000104,-0.000005,0.000093,-0.000014,-0.000102,-0.000006,0.000091,-0.00002,-0.000103,-0.000005,0.000092,-0.000019,-0.000102,-0.000007,0.000091,-0.000023,-0.000103,-0.000005,0.000089,-0.000019,-0.000102,-0.000006,0.000092,-0.000017,-0.000103,-0.000004,0.00009,-0.000016,-0.0001,-0.000005,0.000092,-0.000016,-0.0001,-0.000006,0.000092,-0.000013,-0.000103,-0.000005,0.00009,-0.000018,-0.000101,-0.000005,0.00009,-0.000021,-0.000102,-0.000007,0.000091,-0.000015,-0.000102,-0.000005,0.000088,-0.000019,-0.0001,-0.000004,0.000091,-0.000019,-0.000102,-0.000005,0.000091,-0.000016,-0.0001,-0.000005,0.000088,-0.000015,-0.000102,-0.000007,0.00009,-0.00002,-0.000101,-0.000007,0.000089,-0.00002,-0.0001,-0.000004,0.000088,-0.000022,-0.0001,-0.000005,0.000088,-0.00002,-0.000096,-0.000005,0.00009,-0.000012,-0.0001,-0.000006,0.00009,-0.000008,-0.000098,-0.000005,0.000083,-0.000024,-0.000099,-0.000006,0.000092,-0.000017,-0.000099,-0.000007,0.000089,-0.000021,-0.000099,-0.000005,0.000087,-0.000029,-0.0001,-0.000005,0.00009,-0.000014,-0.0001,-0.000006,0.000086,-0.000018,-0.000098,-0.000006,0.000086,-0.000019,-0.000099,-0.000005,0.000085,-0.000024,-0.0001,-0.000005,0.00009,-0.000014,-0.000098,-0.000006,0.000087,-0.000017,-0.000098,-0.000005,0.000084,-0.000015,-0.000097,-0.000004,0.000087,-0.000012,-0.000097,-0.000006,0.000089,-0.000015,-0.000096,-0.000003,0.00009,-0.000009,-0.000097,-0.000004,0.000089,-0.00002,-0.000095,-0.000003,0.00009,-0.000012,-0.000093,-0.000003,0.000089,-0.000016,-0.000097,-0.000005,0.000089,-0.000009,-0.000098,-0.000005,0.000088,-0.000014,-0.000102,-0.000002,0.000074,-0.000012,-0.000096,0.000012,0.000091,-0.000007,-0.000092,-0.000003,0.000086,-0.000043,-0.000094,0,0.000095,-0.00002,-0.000094,-0.000005,0.000084,-0.000005,-0.000098,0,0.000089,-0.000019,-0.000101,-0.000006,0.000087,-0.000012,-0.000098,-0.000005,0.000095,-0.000016,-0.000096,-0.000007,0.000085,-0.000019,-0.000096,-0.000005,0.000086,-0.000014,-0.000094,-0.000004,0.000086,-0.000024,-0.000096,-0.000003,0.000082,-0.000017,-0.000096,-0.000003,0.000086,-0.000023,-0.000096,-0.000004,0.000088,-0.000026,-0.000097,-0.000003,0.000084,0,-0.000087,-0.000007,0.000085,-0.000016,-0.000095,-0.000002,0.000088,-0.000018,-0.000093,-0.000004,0.000086,-0.00001,-0.000093,-0.000003,0.000087,-0.000012,-0.000094,-0.000004,0.000086,-0.000012,-0.000094,-0.000005,0.000087,-0.000013,-0.000093,-0.000005,0.000085,-0.000017,-0.000093,-0.000005,0.000085,-0.000013,-0.000094,-0.000002,0.000085,-0.000011,-0.000093,-0.000005,0.000076,-0.00001,-0.000082,-0.000003,0.000073,-0.000013,-0.000082,-0.000002,0.000075,-0.00001,-0.000078,-0.000005,0.000074,-0.000008,-0.000079,-0.000002,0.000075,-0.000007,-0.000079,-0.000003,0.000075,-0.000007,-0.000079,-0.000001,0.000074,-0.00001,-0.000084,-0.000003,0.000075,-0.00001,-0.00008,-0.000001,0.000075,-0.000016,-0.00008,-0.000001,0.000075,-0.000007,-0.000078,-0.000004,0.000073,-0.000007,-0.000079,-0.000002,0.000079,-0.000009,-0.000079,-0.000001,0.000072,-0.00001,-0.000079,-0.000002,0.000078,-0.00001,-0.00008,-0.000002,0.000073,-0.000011,-0.000078,-0.000001,0.000073,-0.000009,-0.000079,-0.000004,0.000074,-0.000011,-0.000078,-0.000004,0.000071,-0.000009,-0.00008,-0.000001,0.000073,-0.000013,-0.000078,-0.000002,0.000074,-0.000005,-0.000077,-0.000003,0.000075,0.000002,-0.00008,-0.000002,0.000069,-0.00001,-0.00008,-0.000002,0.000077,0.000001,-0.000084,-0.000002,0.000075,-0.000011,-0.00008,-0.000001,0.000075,-0.000003,-0.000079,-0.000004,0.000073,-0.000012,-0.00008,-0.000001,0.000073,-0.000006,-0.000077,-0.000002,0.000073,-0.000007,-0.000078,-0.000002,0.000072,-0.000006,-0.000075,-0.000002,0.000073,-0.00001,-0.000079,-0.000003,0.000073,-0.000008,-0.000075,-0.000002,0.000072,-0.000006,-0.000077,-0.000002,0.000073,-0.000006,-0.000075,-0.000003,0.000073,-0.000003,-0.000078,-0.000002,0.000074,-0.000008,-0.000076,-0.000002,0.000072,-0.00001,-0.000077,-0.000002,0.000073,-0.000004,-0.000078,-0.000003,0.000067,-0.000011,-0.000076,-0.000002,0.000072,-0.000007,-0.000078,-0.000002,0.000071,-0.000006,-0.000077,-0.000002,0.000074,0,-0.000078,-0.000002,0.00007,-0.000009,-0.000077,-0.000002,0.000073,-0.000004,-0.000076,-0.000002,0.000074,-0.000008,-0.000078,-0.000001,0.000073,-0.000004,-0.000078,-0.000002,0.000068,-0.000005,-0.000075,-0.000003,0.000072,-0.000013,-0.000078,-0.000002,0.00007,-0.00001,-0.000077,-0.000002,0.000072,-0.000009,-0.000076,-0.000002,0.000072,-0.000005,-0.000075,-0.000002,0.000073,-0.000006,-0.000075,-0.000002,0.00007,-0.000003,-0.000073,-0.000002,0.000073,-0.000013,-0.000073,-0.000003,0.000074,-0.000006,-0.000077,0.000001,0.000073,-0.000009,-0.000076,-0.000002,0.000072,-0.000008,-0.000074,-0.000003,0.000072,-0.000007,-0.000074,-0.000003,0.000072,-0.000003,-0.000073,-0.000003,0.000071,-0.000011,-0.000076,0.000001,0.000072,-0.000002,-0.000075,-0.000004,0.00007,-0.000003,-0.000074,-0.000002,0.00007,-0.000007,-0.000075,-0.000002,0.000072,-0.000004,-0.000071,-0.000001,0.000069,-0.000008,-0.000074,-0.000002,0.00007,-0.000004,-0.000073,0,0.000072,-0.000007,-0.000074,-0.000002,0.00007,-0.000002,-0.000074,0,0.000071,0,-0.000074,-0.000002,0.00007,-0.000003,-0.000076,-0.000001,0.000073,-0.000007,-0.000074,-0.000003,0.00007,-0.000002,-0.000071,-0.000002,0.000072,-0.00001,-0.000073,-0.000001,0.000069,-0.000009,-0.000072,-0.000002,0.00007,-0.000004,-0.000075,-0.000001,0.00007,-0.000008,-0.000074,-0.000002,0.000069,0.000002,-0.000076,-0.000002,0.00007,-0.000001,-0.000073,0,0.000071,-0.000002,-0.000074,-0.000001,0.000071,-0.000009,-0.000072,0,0.000072,0.000004,-0.000071,-0.000001,0.00007,-0.000009,-0.000072,0,0.000071,-0.000004,-0.000072,-0.000002,0.000068,-0.000015,-0.000076,-0.000003,0.000071,-0.000008,-0.000071,-0.000004,0.000065,-0.000001,-0.00007,-0.000001,0.000066,-0.000005,-0.000069,0,0.000072,-0.000002,-0.00007,-0.000003,0.000068,-0.000006,-0.000071,-0.000002,0.000071,0.000005,-0.000073,-0.000004,0.000072,-0.000013,-0.000069,0,0.000084,0.000015,-0.000066,0.000001,0.000074,0.000007,-0.000065,-0.000001,0.000071,0.000001,-0.00007,0,0.000069,-0.000001,-0.000069,-0.000002,0.000073,-0.000006,-0.000071,-0.000007,0.000065,-0.000008,-0.000071,-0.000005,0.000068,-0.000014,-0.000071,-0.000004,0.000064,-0.000005,-0.000068,0.000001,0.000066,-0.000002,-0.000072,0,0.000071,0,-0.00007,-0.000001,0.00007,-0.000009,-0.000072,-0.000003,0.000066,-0.000008,-0.000072,-0.000001,0.000068,0.000001,-0.000073,-0.000002,0.000068,0.000001,-0.00007,0.000001,0.000069,-0.000004,-0.00007,-0.000003,0.000068,-0.000005,-0.000069,0.000001,0.000065,-0.000008,-0.000062,0,0.000061,0.000002,-0.000065,-0.000001,0.000064,-0.000004,-0.000065,0,0.000068,-0.000003,-0.000064,-0.000001,0.000062,-0.000002,-0.000063,-0.000002,0.000063,0.000002,-0.000064,0,0.000062,-0.000005,-0.000067,0,0.000062,-0.000005,-0.000065,-0.000001,0.000064,-0.000007,-0.000061,0.000001,0.000063,0.000008,-0.000066,0,0.000064,0.000003,-0.000065,0,0.000064,-0.000001,-0.000065,-0.000002,0.000062,0.000002,-0.000062,0,0.000059,0,-0.000064,-0.000003,0.000064,0.000005,-0.000063,-0.000001,0.000064,0.000001,-0.000065,0.000001,0.000062,-0.000007,-0.000064,0,0.000063,-0.000005,-0.000065,-0.000002,0.000065,-0.000005,-0.000064,-0.000001,0.000062,-0.000002,-0.000065,-0.000001,0.000064,0.000004,-0.000064,0,0.000061,-0.000004,-0.000064,0,0.000062,0.000001,-0.000064,-0.000001,0.000062,-0.000002,-0.000065,0,0.000062,0.000001,-0.000062,-0.000002,0.000063,0.000005,-0.000063,-0.000001,0.000064,0.000002,-0.000063,0,0.000064,0.000001,-0.000063,0.000001,0.000062,-0.000003,-0.000061,-0.000001,0.000062,0.000001,-0.000062,-0.000001,0.000064,-0.000002,-0.000064,0,0.000061,0,-0.000063,-0.000002,0.00006,0.000002,-0.000063,0,0.000062,0,-0.000063,-0.000002,0.000063,-0.000001,-0.000063,0,0.000064,0,-0.000063,0,0.000062,0.000003,-0.000064,0.000001,0.000063,-0.000001,-0.000062,-0.000001,0.000064,-0.000003,-0.000063,0.000002,0.000062,-0.000002,-0.000061,0,0.000061,0.000007,-0.000063,-0.000001,0.000062,0.000013,-0.00006,0.000002,0.000063,-0.000005,-0.000067,-0.000002,0.000074,0,-0.000066]};
    const triangle = {"real":[0,0.810569,0,0.090063,0,0.032423,0,0.016542,0,0.010007,0,0.006699,0,0.004796,0,0.003603,0,0.002805,0,0.002245,0,0.001838,0,0.001532,0,0.001297,0,0.001112,0,0.000964,0,0.000843,0,0.000744,0,0.000662,0,0.000592,0,0.000533,0,0.000482,0,0.000438,0,0.0004,0,0.000367,0,0.000338,0,0.000312,0,0.000289,0,0.000268,0,0.000249,0,0.000233,0,0.000218,0,0.000204,0,0.000192,0,0.000181,0,0.00017,0,0.000161,0,0.000152,0,0.000144,0,0.000137,0,0.00013,0,0.000124,0,0.000118,0,0.000112,0,0.000107,0,0.000102,0,0.000098,0,0.000094,0,0.00009,0,0.000086,0,0.000083,0,0.000079,0,0.000076,0,0.000074,0,0.000071,0,0.000068,0,0.000066,0,0.000063,0,0.000061,0,0.000059,0,0.000057,0,0.000055,0,0.000054,0,0.000052,0,0.00005,0,0.000049,0,0.000047,0,0.000046,0,0.000044,0,0.000043,0,0.000042,0,0.000041,0,0.00004,0,0.000039,0,0.000038,0,0.000037,0,0.000036,0,0.000035,0,0.000034,0,0.000033,0,0.000032,0,0.000031,0,0.000031,0,0.00003,0,0.000029,0,0.000028,0,0.000028,0,0.000027,0,0.000026,0,0.000026,0,0.000025,0,0.000025,0,0.000024,0,0.000024,0,0.000023,0,0.000023,0,0.000022,0,0.000022,0,0.000021,0,0.000021,0,0.00002,0,0.00002,0,0.00002,0,0.000019,0,0.000019,0,0.000019,0,0.000018,0,0.000018,0,0.000018,0,0.000017,0,0.000017,0,0.000017,0,0.000016,0,0.000016,0,0.000016,0,0.000015,0,0.000015,0,0.000015,0,0.000015,0,0.000014,0,0.000014,0,0.000014,0,0.000014,0,0.000014,0,0.000013,0,0.000013,0,0.000013,0,0.000013,0,0.000012,0,0.000012,0,0.000012,0,0.000012,0,0.000012,0,0.000012,0,0.000011,0,0.000011,0,0.000011,0,0.000011,0,0.000011,0,0.000011,0,0.00001,0,0.00001,0,0.00001,0,0.00001,0,0.00001,0,0.00001,0,0.00001,0,0.000009,0,0.000009,0,0.000009,0,0.000009,0,0.000009,0,0.000009,0,0.000009,0,0.000009,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000008,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000007,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000006,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000005,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000004,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000003,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000002,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0.000001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]};
    const fuzzyGuitar = {"real":[0,0,-0.201064,0.149827,-0.098477,0.080283,-0.07026,0.050394,-0.080673,0.008269,-0.036969,0.004236,-0.04326,0.003565,-0.032427,0.005396,-0.021767,0.020271,-0.014946,0.011036,-0.010757,0.008469,-0.008275,0.007381,-0.007226,0.007081,-0.006944,0.006814,-0.006901,0.006781,-0.006668,0.006559,-0.006658,0.006557,-0.00646,0.006367,-0.006474,0.006386,-0.00691,0.007253,-0.007616,0.007523,-0.007903,0.015019,-0.004959,0.015204,-0.009771,0.011013,-0.011777,0.009387,-0.013783,0.005373,-0.016199,0.002294,-0.014408,0.004261,-0.012516,0.006986,-0.009093,0.00778,-0.008031,0.008135,-0.007589,0.007301,-0.005843,0.005798,-0.005754,0.005711,-0.005669,0.005458,-0.005255,0.00506,-0.005025,0.004991,-0.004807,0.004775,-0.004744,0.004713,-0.004683,0.004653,-0.004624,0.004596,-0.004567,0.00454,-0.004513,0.004486,-0.00446,0.004435,-0.004409,0.004385,-0.00436,0.003955,-0.003933,0.003912,-0.003891,0.003871,-0.003851,0.003831,-0.003811,0.003566,-0.003548,0.003531,-0.003514,0.003497,-0.00348,0.003463,-0.003447,0.003226,-0.003211,0.003197,-0.003182,0.003168,-0.003154,0.00314,-0.002851,0.002839,-0.002826,0.002814,-0.002802,0.00279,-0.002779,0.002767,-0.002756,0.002745,-0.002734,0.002483,-0.002473,0.002464,-0.002454,0.002444,-0.002435,0.002426,-0.002417,0.002407,-0.002398,0.00239,-0.002239,0.002231,-0.002223,0.002215,-0.002207,0.002199,-0.002191,0.002183,-0.002176,0.002168,-0.002161,0.002025,-0.002018,0.002012,-0.002005,0.001998,-0.001992,0.001985,-0.001979,0.001972,-0.001966,0.00196,-0.001953,0.001947,-0.001941,0.001935,-0.001929,0.001923,-0.001917,0.001911,-0.001906,0.0019,-0.001894,0.001889,-0.001883,0.001877,-0.001872,0.001867,-0.001861,0.001856,-0.00185,0.001845,-0.00184,0.001835,-0.00183,0.001825,-0.00182,0.001815,-0.00181,0.001805,-0.0018,0.001795,-0.00179,0.001785,-0.001781,0.001776,-0.001771,0.001767,-0.001657,0.001653,-0.001648,0.001644,-0.00164,0.001636,-0.001632,0.001628,-0.001624,0.001619,-0.001615,0.001611,-0.001607,0.001555,-0.001551,0.001548,-0.001544,0.00154,-0.001536,0.001533,-0.001529,0.001525,-0.001522,0.001518,-0.001515,0.001511,-0.001508,0.001504,-0.001501,0.001497,-0.001494,0.001491,-0.001487,0.001484,-0.001481,0.001477,-0.001474,0.001471,-0.001467,0.001464,-0.001253,0.00125,-0.001248,0.001245,-0.001242,0.00124,-0.001237,0.001234,-0.001232,0.001229,-0.001227,0.001224,-0.001221,0.001219,-0.001216,0.001214,-0.001211,0.001209,-0.001206,0.001204,-0.001201,0.001199,-0.001196,0.001194,-0.001192,0.001189,-0.001187,0.001185,-0.001182,0.00118,-0.001178,0.001175,-0.001173,0.001171,-0.001168,0.001166,-0.001164,0.001162,-0.001159,0.001157,-0.001155,0.001153,-0.000987,0.000985,-0.000983,0.000981,-0.000979,0.000978,-0.000976,0.000974,-0.000972,0.00097,-0.000968,0.000967,-0.000965,0.000963,-0.000961,0.00096,-0.000958,0.000956,-0.000954,0.000953,-0.000951,0.000949,-0.000948,0.000946,-0.000944,0.000942,-0.000941,0.000939,-0.000938,0.000936,-0.000934,0.000933,-0.000931,0.000929,-0.000928,0.000926,-0.000924,0.000923,-0.000921,0.00092,-0.000918,0.000916,-0.000915,0.000913,-0.000912,0.00091,-0.000909,0.000907,-0.000906,0.000904,-0.000903,0.000822,-0.00082,0.000819,-0.000818,0.000816,-0.000815,0.000814,-0.000812,0.000811,-0.00081,0.000808,-0.000807,0.000806,-0.000804,0.000803,-0.000802,0.0008,-0.000799,0.000798,-0.000796,0.000795,-0.000794,0.000793,-0.000791,0.00079,-0.000789,0.000787,-0.000786,0.000785,-0.000784,0.000782,-0.000781,0.00078,-0.000779,0.000777,-0.000776,0.000775,-0.000774,0.000772,-0.000771,0.00077,-0.000769,0.000768,-0.000766,0.000765,-0.000764,0.000763,-0.000762,0.00076,-0.000759,0.000758,-0.000757,0.000756,-0.000754,0.000753,-0.000752,0.000706,-0.000705,0.000704,-0.000703,0.000702,-0.000701,0.0007,-0.000699,0.000697,-0.000696,0.000695,-0.000694,0.000693,-0.000692,0.000691,-0.00069,0.000689,-0.000688,0.000687,-0.000686,0.000685,-0.000684,0.000683,-0.000682,0.000681,-0.000679,0.000678,-0.000677,0.000676,-0.000675,0.000674,-0.000673,0.000672,-0.000671,0.00067,-0.000669,0.000668,-0.000667,0.000666,-0.000665,0.000664,-0.000663,0.000662,-0.000661,0.00066,-0.000659,0.000658,-0.000657,0.000656,-0.000655,0.000654,-0.000653,0.000652,-0.000651,0.00065,-0.000649,0.000648,-0.000647,0.000646,-0.000645,0.000644,-0.000643,0.000642,-0.000641,0.00064,-0.000639,0.000638,-0.000637,0.000636,-0.000635,0.000634,-0.000633,0.000632,-0.000631,0.00063,-0.000629,0.000629,-0.000628,0.000627,-0.000626,0.000625,-0.000624,0.000623,-0.000622,0.000621,-0.00062,0.000619,-0.000618,0.000617,-0.000616,0.000615,-0.000614,0.000613,-0.000612,0.000611,-0.00061,0.000609,-0.000608,0.000607,-0.000607,0.000606,-0.000605,0.000586,-0.000585,0.000584,-0.000583,0.000582,-0.000581,0.00058,-0.000579,0.000578,-0.000577,0.000576,-0.000575,0.000575,-0.000574,0.000573,-0.000572,0.000571,-0.00057,0.000569,-0.000568,0.000567,-0.000566,0.000566,-0.000565,0.000564,-0.000563,0.000562,-0.000561,0.00056,-0.000559,0.000558,-0.000557,0.000556,-0.000556,0.000555,-0.000554,0.000553,-0.000552,0.000551,-0.00055,0.000549,-0.000548,0.000548,-0.000547,0.000546,-0.000545,0.000544,-0.000543,0.000542,-0.000541,0.00054,-0.000539,0.000538,-0.000538,0.000537,-0.000536,0.000535,-0.000534,0.000533,-0.000532,0.000531,-0.00053,0.000529,-0.000529,0.000528,-0.000527,0.000526,-0.000525,0.000524,-0.000523,0.000522,-0.000521,0.00052,-0.00052,0.000519,-0.000518,0.000517,-0.000516,0.000515,-0.000514,0.000513,-0.000512,0.000512,-0.000511,0.00051,-0.000509,0.000508,-0.000507,0.000506,-0.00049,0.000489,-0.000488,0.000487,-0.000486,0.000486,-0.000485,0.000484,-0.000483,0.000482,-0.000481,0.00048,-0.000479,0.000478,-0.000478,0.000477,-0.000476,0.000475,-0.000474,0.000473,-0.000472,0.000471,-0.00047,0.00047,-0.000469,0.000468,-0.000467,0.000466,-0.000465,0.000464,-0.000463,0.000462,-0.000461,0.000461,-0.00046,0.000459,-0.000458,0.000457,-0.000456,0.000455,-0.000454,0.000453,-0.000453,0.000452,-0.000451,0.00045,-0.000449,0.000448,-0.000447,0.000446,-0.000445,0.000445,-0.000444,0.000443,-0.000442,0.000441,-0.00044,0.000439,-0.000438,0.000437,-0.000436,0.000435,-0.000434,0.000433,-0.000433,0.000432,-0.000431,0.00043,-0.000429,0.000428,-0.000427,0.000426,-0.000425,0.000424,-0.000423,0.000422,-0.000422,0.00042,-0.00042,0.000419,-0.000418,0.000417,-0.000416,0.000415,-0.000414,0.000413,-0.000412,0.000411,-0.00041,0.000435,-0.000434,0.000433,-0.000432,0.000431,-0.00043,0.000429,-0.000428,0.000427,-0.000426,0.000425,-0.000424,0.000423,-0.000423,0.000421,-0.00042,0.000419,-0.000418,0.000417,-0.000416,0.000415,-0.000414,0.000413,-0.000412,0.000411,-0.00041,0.000409,-0.000408,0.000407,-0.000406,0.000405,-0.000404,0.000403,-0.000402,0.000401,-0.0004,0.000399,-0.000398,0.000397,-0.000396,0.000395,-0.000393,0.000392,-0.000391,0.00039,-0.000389,0.000388,-0.000387,0.000386,-0.000385,0.000384,-0.000383,0.000382,-0.000381,0.00038,-0.000379,0.000378,-0.000377,0.000376,-0.000375,0.000374,-0.000373,0.000372,-0.00037,0.000369,-0.000368,0.000367,-0.000366,0.000365,-0.000364,0.000363,-0.000362,0.000361,-0.00036,0.000359,-0.000358,0.000356,-0.000355,0.000354,-0.000353,0.000352,-0.000351,0.00035,-0.000349,0.000348,-0.000347,0.000346,-0.000345,0.000344,-0.000342,0.000341,-0.00034,0.000339,-0.000338,0.000337,-0.000336,0.000335,-0.000333,0.000332,-0.000331,0.00033,-0.000329,0.000328,-0.000327,0.000326,-0.000325,0.000323,-0.000322,0.000321,-0.00032,0.000319,-0.000318,0.000317,-0.000315,0.000314,-0.000313,0.000312,-0.000311,0.00031,-0.000309,0.000308,-0.000306,0.000305,-0.000304,0.000303,-0.000302,0.000301,-0.0003,0.000298,-0.000297,0.000296,-0.000295,0.000294,-0.000293,0.000291,-0.00029,0.000289,-0.000288,0.000287,-0.000286,0.000284,-0.000283,0.000282,-0.000281,0.00028,-0.000279,0.000277,-0.000276,0.000275,-0.000274,0.000273,-0.000272,0.00027,-0.000269,0.000268,-0.000267,0.000266,-0.000265,0.000263,-0.000262,0.000261,-0.00026,0.000259,-0.000257,0.000256,-0.000255,0.000254,-0.000252,0.000251,-0.00025,0.000249,-0.000248,0.000246,-0.000245,0.000244,-0.000243,0.000242,-0.00024,0.000239,-0.000238,0.000237,-0.000236,0.000234,-0.000233,0.000232,-0.00023,0.00023,-0.000228,0.000227,-0.000226,0.000224,-0.000223,0.000222,-0.000221,0.00022,-0.000218,0.000217,-0.000216,0.000215,-0.000213,0.000212,-0.000211,0.00021,-0.000209,0.000207,-0.000206,0.000205,-0.000204,0.000202,-0.000201,0.000199,-0.000198,0.000197,-0.000196,0.000194,-0.000193,0.000192,-0.000191,0.00019,-0.000188,0.000187,-0.000186,0.000185,-0.000183,0.000182,-0.000181,0.00018,-0.000178,0.000177,-0.000176,0.000175,-0.000173,0.000172,-0.00017,0.000169,-0.000168,0.000166,-0.000165,0.000164,-0.000163,0.000161,-0.00016,0.000159,-0.000158,0.000156,-0.000155,0.000154,-0.000153,0.000151,-0.00015,0.000149,-0.000147,0.000146,-0.000145,0.000144,-0.000142,0.000141,-0.000139,0.000138,-0.000137,0.000135,-0.000134,0.000133,-0.000132,0.00013,-0.000129,0.000128,-0.000126,0.000125,-0.000124,0.000123,-0.000121,0.00012,-0.000119,0.000117,-0.000116,0.000115,-0.000113,0.000112,-0.00011,0.000109,-0.000108,0.000106,-0.000105,0.000104,-0.000102,0.000101,-0.0001,0.000099,-0.000097,0.000096,-0.000095,0.000093,-0.000092,0.000091,-0.000089,0.000088,-0.000087,0.000085,-0.000084,0.000082,-0.000081,0.00008,-0.000078,0.000077,-0.000076,0.000074,-0.000073,0.000072,-0.00007,0.000069,-0.000068,0.000066,-0.000065,0.000064,-0.000063,0.000061,-0.00006,0.000059,-0.000057,0.000055,-0.000054,0.000053,-0.000051,0.00005,-0.000049,0.000047,-0.000046,0.000045,-0.000043,0.000042,-0.000041,0.000039,-0.000038,0.000037,-0.000035,0.000034,-0.000033,0.000031,-0.00003,0.000029,-0.000027,0.000026,-0.000024,0.000023,-0.000022,0.00002,-0.000019,0.000018,-0.000016,0.000015,-0.000014,0.000012,-0.000011,0.00001,-0.000008,0.000007,-0.000006,0.000004,-0.000003,0.000002,0,-0.000002,0.000003,-0.000004,0.000006,-0.000007,0.000008,-0.00001,0.000011,-0.000012,0.000014,-0.000015,0.000016,-0.000018,0.000019,-0.00002,0.000022,-0.000023,0.000024,-0.000026,0.000027,-0.000029,0.00003,-0.000031,0.000033,-0.000034,0.000035,-0.000037,0.000038,-0.000039,0.000041,-0.000042,0.000043,-0.000045,0.000046,-0.000047,0.000049,-0.00005,0.000051,-0.000053,0.000054,-0.000055,0.000057,-0.000058,0.00006,-0.000061,0.000063,-0.000064,0.000065,-0.000066,0.000068,-0.000069,0.00007,-0.000072,0.000073,-0.000074,0.000076,-0.000077,0.000078,-0.00008,0.000081,-0.000082,0.000084,-0.000085,0.000086,-0.000088,0.000089,-0.000091,0.000092,-0.000093,0.000095,-0.000096,0.000097,-0.000098,0.0001,-0.000101,0.000102,-0.000104,0.000105,-0.000106,0.000108,-0.000109,0.00011,-0.000111,0.000113,-0.000115,0.000116,-0.000117,0.000118,-0.00012,0.000121,-0.000122,0.000124,-0.000125,0.000126,-0.000127,0.000129,-0.00013,0.000131,-0.000132,0.000134,-0.000135,0.000136,-0.000138,0.000139,-0.000141,0.000142,-0.000143,0.000144,-0.000146,0.000147,-0.000148,0.000149,-0.000151,0.000152,-0.000153,0.000154,-0.000156,0.000157,-0.000158,0.000159,-0.000161,0.000162,-0.000163,0.000164,-0.000165,0.000167,-0.000168,0.000169,-0.000171,0.000172,-0.000173,0.000175,-0.000176,0.000177,-0.000178,0.000179,-0.000181,0.000182,-0.000183,0.000184,-0.000185,0.000187,-0.000188,0.000189,-0.00019,0.000191,-0.000193,0.000194,-0.000195,0.000196,-0.000197,0.000199,-0.0002,0.000201,-0.000202,0.000204,-0.000205,0.000206,-0.000207,0.000208,-0.000209,0.000211,-0.000212,0.000213,-0.000214,0.000215,-0.000216,0.000217,-0.000219,0.00022,-0.000221,0.000222,-0.000223,0.000224,-0.000226,0.000227,-0.000228,0.000229,-0.00023,0.000231,-0.000232,0.000234,-0.000235,0.000236,-0.000237,0.000238,-0.000239,0.00024,-0.000241,0.000242,-0.000243,0.000244,-0.000245,0.000246,-0.000248,0.000249,-0.00025,0.000251,-0.000252,0.000253,-0.000254,0.000255,-0.000256,0.000257,-0.000258,0.000259,-0.00026,0.000261,-0.000262,0.000263,-0.000264,0.000266,-0.000267,0.000268,-0.000269,0.00027,-0.00027,0.000271,-0.000272,0.000273,-0.000274,0.000275,-0.000276,0.000277,-0.000279,0.000279,-0.00028,0.000281,-0.000282,0.000283,-0.000284,0.000285,-0.000286,0.000287,-0.000288,0.000289,-0.00029,0.000291,-0.000292,0.000292,-0.000294,0.000294,-0.000295,0.000296,-0.000297,0.000298,-0.000299,0.0003,-0.000301,0.000301,-0.000302,0.000303,-0.000304,0.000305,-0.000306,0.000307,-0.000307,0.000308,-0.000309,0.00031,-0.000311,0.000312,-0.000312,0.000313,-0.000314,0.000315,-0.000316,0.000316,-0.000317,0.000318,-0.000319,0.00032,-0.00032,0.000321,-0.000322,0.000323,-0.000323,0.000324,-0.000325,0.000326,-0.000326,0.000327,-0.000328,0.000328,-0.000329,0.00033,-0.000331,0.000331,-0.000332,0.000333,-0.000333,0.000334,-0.000335,0.000335,-0.000336,0.000337,-0.000337,0.000338,-0.000339,0.000339,-0.00034,0.000341,-0.000341,0.000342,-0.000342,0.000343,-0.000344,0.000344,-0.000345,0.000345,-0.000346,0.000347,-0.000347,0.000348,-0.000348,0.000349,-0.000349,0.00035,-0.00035,0.000351,-0.000352,0.000352,-0.000353,0.000353,-0.000354,0.000354,-0.000354,0.000355,-0.000355,0.000356,-0.000356,0.000357,-0.000357,0.000358,-0.000358,0.000359,-0.000359,0.00036,-0.00036,0.00036,-0.000361,0.000361,-0.000362,0.000362,-0.000362,0.000363,-0.000363,0.000363,-0.000364,0.000364,-0.000365,0.000365,-0.000365,0.000366,-0.000366,0.000366,-0.000366,0.000367,-0.000367,0.000367,-0.000368,0.000368,-0.000368,0.000369,-0.000369,0.000369,-0.000369,0.00037,-0.00037,0.00037,-0.00037,0.000371,-0.000371,0.000371,-0.000371,0.000371,-0.000372,0.000372,-0.000372,0.000372,-0.000372,0.000372,-0.000373,0.000373,-0.000373,0.000373,-0.000373,0.000362,-0.000362,0.000362,-0.000362,0.000362,-0.000362,0.000362,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000363,-0.000363,0.000362,-0.000362,0.000362,-0.000362,0.000362,-0.000362,0.000362,-0.000362,0.000362,-0.000362,0.000361,-0.000361,0.000361,-0.000361,0.000361,-0.000361,0.000361,-0.00036,0.00036,-0.00036,0.00036,-0.00036,0.000359,-0.000359,0.000359,-0.000359,0.000358,-0.000358,0.000358,-0.000358,0.000357,-0.000357,0.000357,-0.000357,0.000356,-0.000356,0.000356,-0.000355,0.000355,-0.000355,0.000354,-0.000354,0.000354,-0.000353,0.000353,-0.000352,0.000352,-0.000352,0.000351,-0.000351,0.000351,-0.00035,0.00035,-0.000349,0.000349,-0.000348,0.000348,-0.000348,0.000347,-0.000347,0.000346,-0.000346,0.000345,-0.000345,0.000344,-0.000344,0.000343,-0.000343,0.000342,-0.000342,0.000341,-0.000341,0.00034,-0.000339,0.000339,-0.000338,0.000338,-0.000337,0.000336,-0.000336,0.000335,-0.000335,0.000334,-0.000333,0.000333,-0.000332,0.000331,-0.000331,0.00033,-0.000329,0.000329,-0.000328,0.000327,-0.000327,0.000326,-0.000325,0.000325,-0.000324,0.000323,-0.000322,0.000322,-0.000321,0.00032,-0.000319,0.000318,-0.000318,0.000317,-0.000316,0.000315,-0.000314,0.000314,-0.000313,0.000312,-0.000311,0.00031,-0.00031,0.000309,-0.000308,0.000307,-0.000306,0.000305,-0.000304,0.000303,-0.000303,0.000302,-0.000301,0.0003,-0.000299,0.000298,-0.000297,0.000296,-0.000295,0.000294,-0.000293,0.000292,-0.000291,0.00029,-0.000289,0.000288,-0.000287,0.000286,-0.000285,0.000284,-0.000283,0.000282,-0.000281,0.00028,-0.000279,0.000278,-0.000277,0.000276,-0.000275,0.000274,-0.000272,0.000271,-0.00027,0.000269,-0.000268,0.000267,-0.000266,0.000265,-0.000264,0.000262,-0.000261,0.00026,-0.000259,0.000258,-0.000257,0.000256,-0.000254,0.000253,-0.000252,0.000251,-0.000249,0.000248,-0.000247,0.000246,-0.000244,0.000243,-0.000242,0.000241,-0.000239,0.000238,-0.000237,0.000235,-0.000234,0.000226,-0.000225,0.000224,-0.000222,0.000221,-0.00022,0.000219,-0.000217,0.000216,-0.000215,0.000213,-0.000212,0.000211,-0.000209,0.000208,-0.000207,0.000206,-0.000204,0.000203,-0.000201,0.0002,-0.000199,0.000197,-0.000196,0.000195,-0.000194,0.000192,-0.000191,0.000189,-0.000188,0.000186,-0.000185,0.000184,-0.000182,0.000181,-0.000179,0.000178,-0.000176,0.000175,-0.000174,0.000172,-0.000171,0.000169,-0.000168,0.000167,-0.000165,0.000163,-0.000162,0.000161,-0.000159,0.000158,-0.000156,0.000155,-0.000153,0.000152,-0.00015,0.000149,-0.000147,0.000146,-0.000144,0.000142,-0.000141,0.00014,-0.000138,0.000136,-0.000135,0.000134,-0.000132,0.00013,-0.000129,0.000127,-0.000126,0.000124,-0.000123,0.000121,-0.000119,0.000118,-0.000117,0.000115,-0.000113,0.000111,-0.00011,0.000109,-0.000107,0.000105,-0.000103,0.000102,-0.0001,0.000099,-0.000097,0.000096,-0.000094,0.000092,-0.000091,0.000089,-0.000088,0.000086,-0.000084,0.000083,-0.000081,0.000079,-0.000078,0.000076,-0.000074,0.000073,-0.000071,0.00007,-0.000068,0.000066,-0.000065,0.000063,-0.000061,0.00006,-0.000058,0.000056,-0.000055,0.000053,-0.000052,0.00005,-0.000048,0.000046,-0.000045,0.000043,-0.000041,0.00004,-0.000038,0.000036,-0.000035,0.000033,-0.000031,0.00003,-0.000028,0.000026,-0.000025,0.000023,-0.000021,0.000019,-0.000018,0.000016,-0.000014,0.000013,-0.000011,0.000009,-0.000008,0.000006,-0.000005,0.000003,-0.000001,0,0.000002,-0.000004,0.000006,-0.000007,0.000009,-0.000011,0.000013,-0.000014,0.000016,-0.000018,0.000019,-0.000021,0.000023,-0.000024,0.000026,-0.000027,0.000029,-0.000031,0.000032,-0.000034,0.000036,-0.000038,0.000039,-0.000041,0.000043,-0.000044,0.000046,-0.000048,0.000049,-0.000051,0.000052,-0.000054,0.000056,-0.000058,0.000059,-0.000061,0.000063,-0.000064,0.000066,-0.000067,0.000069,-0.000071,0.000072,-0.000074,0.000076,-0.000078,0.000079,-0.000081,0.000082,-0.000084,0.000086,-0.000087,0.000089,-0.00009,0.000092,-0.000093,0.000095,-0.000097,0.000098,-0.0001,0.000102,-0.000103,0.000105,-0.000106,0.000108,-0.000109,0.000111,-0.000113,0.000114,-0.000116,0.000117,-0.000119,0.00012,-0.000122,0.000123,-0.000125,0.000127,-0.000128,0.00013,-0.000131,0.000133,-0.000134,0.000136,-0.000137,0.000139,-0.00014,0.000142,-0.000143,0.000145,-0.000146,0.000148,-0.000149,0.000151,-0.000152,0.000154,-0.000155,0.000157,-0.000158,0.000137,-0.000138,0.000139,-0.00014,0.000142,-0.000143,0.000144,-0.000145,0.000146,-0.000147,0.000149,-0.00015,0.000151,-0.000152,0.000154,-0.000155,0.000156,-0.000157,0.000158,-0.000159,0.000161,-0.000162,0.000163,-0.000164,0.000165,-0.000166,0.000167,-0.000168,0.00017,-0.000171,0.000171,-0.000173,0.000174,-0.000175,0.000176,-0.000177,0.000178,-0.000179,0.00018,-0.000181,0.000182,-0.000183,0.000184,-0.000185,0.000186,-0.000187,0.000188,-0.000189,0.00019,-0.000191,0.000192,-0.000193,0.000194,-0.000195,0.000196,-0.000197,0.000198,-0.000199,0.0002,-0.000201,0.000202,-0.000203,0.000203,-0.000204,0.000205,-0.000206,0.000207,-0.000208,0.000209,-0.000209,0.00021,-0.000211,0.000212,-0.000213,0.000214,-0.000214,0.000215,-0.000216,0.000217,-0.000217,0.000218,-0.000219,0.00022,-0.00022,0.000221,-0.000222,0.000223,-0.000224,0.000224,-0.000225,0.000225,-0.000226,0.000227,-0.000228,0.000228,-0.000229,0.000229,-0.00023,0.000231,-0.000231,0.000232,-0.000233,0.000233,-0.000234,0.000234,-0.000235,0.000236,-0.000236,0.000237,-0.000237,0.000238,-0.000238,0.000239,-0.000239,0.00024,-0.00024,0.000241,-0.000241,0.000242,-0.000242,0.000243,-0.000243,0.000243,-0.000244,0.000244,-0.000245,0.000245,-0.000245,0.000246,-0.000246,0.000246,-0.000247,0.000247,-0.000248,0.000248,-0.000248,0.000248,-0.000249,0.000249,-0.000249,0.00025,-0.00025,0.00025,-0.00025,0.000251,-0.000251,0.000251,-0.000251,0.000251,-0.000252,0.000252,-0.000252,0.000252,-0.000252,0.000252,-0.000252,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253,-0.000253,0.000253],"imag":[0,0.202613,-0.000001,0.000002,-0.000002,0.000003,-0.000004,0.000004,-0.000008,0.000001,-0.000006,0.000001,-0.000009,0.000001,-0.00001,0.000002,-0.000008,0.000009,-0.000007,0.000006,-0.000006,0.000005,-0.000007,0.000005,-0.000005,0.000009,-0.000008,0.000005,-0.000008,0.00001,-0.000009,0.000011,-0.00001,0.000011,-0.000011,0.000011,-0.000012,0.000013,-0.000015,0.000017,-0.000018,0.000019,-0.000021,0.000042,-0.000014,0.000046,-0.000031,0.000036,-0.000041,0.000034,-0.000052,0.000021,-0.000066,0.00001,-0.000063,0.000019,-0.000059,0.000034,-0.000046,0.000041,-0.000043,0.000045,-0.000044,0.000043,-0.000035,0.000036,-0.000037,0.000038,-0.000039,0.000039,-0.000038,0.000038,-0.000039,0.00004,-0.00004,0.00004,-0.000041,0.000042,-0.000043,0.000043,-0.000044,0.000045,-0.000046,0.000047,-0.000048,0.000049,-0.000049,0.00005,-0.000051,0.000052,-0.000053,0.000049,-0.00005,0.000051,-0.000052,0.000052,-0.000053,0.000054,-0.000055,0.000052,-0.000053,0.000054,-0.000055,0.000055,-0.000057,0.000057,-0.000058,0.000056,-0.000056,0.000057,-0.000057,0.000059,-0.000059,0.00006,-0.000056,0.000056,-0.000057,0.000058,-0.000059,0.000059,-0.00006,0.000061,-0.000061,0.000062,-0.000063,0.000058,-0.000059,0.000059,-0.000061,0.000061,-0.000062,0.000062,-0.000063,0.000064,-0.000065,0.000065,-0.000062,0.000063,-0.000063,0.000064,-0.000065,0.000066,-0.000066,0.000067,-0.000067,0.000068,-0.000069,0.000066,-0.000066,0.000067,-0.000067,0.000068,-0.000069,0.000069,-0.000071,0.000071,-0.000072,0.000072,-0.000073,0.000074,-0.000075,0.000075,-0.000076,0.000076,-0.000077,0.000078,-0.000079,0.00008,-0.00008,0.000081,-0.000081,0.000082,-0.000083,0.000084,-0.000085,0.000085,-0.000086,0.000086,-0.000088,0.000088,-0.000089,0.00009,-0.00009,0.000091,-0.000092,0.000093,-0.000093,0.000094,-0.000095,0.000096,-0.000097,0.000097,-0.000098,0.000098,-0.000094,0.000094,-0.000095,0.000096,-0.000097,0.000097,-0.000098,0.000098,-0.000099,0.0001,-0.000101,0.000101,-0.000102,0.0001,-0.000101,0.000101,-0.000102,0.000103,-0.000104,0.000104,-0.000105,0.000106,-0.000107,0.000107,-0.000108,0.000109,-0.00011,0.00011,-0.000111,0.000112,-0.000113,0.000113,-0.000114,0.000115,-0.000116,0.000116,-0.000117,0.000118,-0.000119,0.000119,-0.000103,0.000104,-0.000104,0.000105,-0.000106,0.000106,-0.000107,0.000108,-0.000108,0.000109,-0.000109,0.00011,-0.000111,0.000111,-0.000112,0.000113,-0.000113,0.000115,-0.000115,0.000116,-0.000117,0.000117,-0.000118,0.000119,-0.000119,0.00012,-0.000121,0.000121,-0.000122,0.000123,-0.000123,0.000124,-0.000125,0.000126,-0.000126,0.000127,-0.000128,0.000128,-0.000129,0.00013,-0.00013,0.000131,-0.000113,0.000114,-0.000114,0.000115,-0.000116,0.000116,-0.000117,0.000117,-0.000118,0.000119,-0.000119,0.00012,-0.000121,0.000121,-0.000122,0.000122,-0.000123,0.000124,-0.000124,0.000125,-0.000126,0.000126,-0.000127,0.000127,-0.000128,0.000129,-0.000129,0.00013,-0.000131,0.000131,-0.000132,0.000133,-0.000133,0.000134,-0.000135,0.000135,-0.000136,0.000136,-0.000137,0.000138,-0.000138,0.000139,-0.00014,0.00014,-0.000141,0.000142,-0.000142,0.000143,-0.000143,0.000144,-0.000145,0.000133,-0.000133,0.000134,-0.000135,0.000135,-0.000136,0.000136,-0.000137,0.000138,-0.000138,0.000139,-0.000139,0.00014,-0.000141,0.000141,-0.000142,0.000143,-0.000143,0.000144,-0.000144,0.000145,-0.000146,0.000146,-0.000147,0.000147,-0.000148,0.000149,-0.000149,0.00015,-0.000151,0.000151,-0.000152,0.000152,-0.000153,0.000154,-0.000154,0.000155,-0.000156,0.000156,-0.000157,0.000158,-0.000158,0.000159,-0.000159,0.00016,-0.000161,0.000161,-0.000162,0.000163,-0.000163,0.000164,-0.000164,0.000165,-0.000166,0.000167,-0.000167,0.000158,-0.000158,0.000159,-0.00016,0.00016,-0.000161,0.000161,-0.000162,0.000163,-0.000163,0.000164,-0.000164,0.000165,-0.000166,0.000166,-0.000167,0.000168,-0.000168,0.000169,-0.000169,0.00017,-0.000171,0.000171,-0.000172,0.000172,-0.000173,0.000174,-0.000174,0.000175,-0.000176,0.000176,-0.000177,0.000177,-0.000178,0.000179,-0.000179,0.00018,-0.000181,0.000181,-0.000182,0.000182,-0.000183,0.000184,-0.000184,0.000185,-0.000185,0.000186,-0.000187,0.000187,-0.000188,0.000189,-0.000189,0.00019,-0.000191,0.000191,-0.000192,0.000192,-0.000193,0.000194,-0.000194,0.000195,-0.000196,0.000196,-0.000197,0.000198,-0.000198,0.000199,-0.000199,0.0002,-0.000201,0.000201,-0.000202,0.000203,-0.000203,0.000204,-0.000205,0.000205,-0.000206,0.000207,-0.000207,0.000208,-0.000208,0.000209,-0.00021,0.00021,-0.000211,0.000212,-0.000212,0.000213,-0.000214,0.000214,-0.000215,0.000216,-0.000216,0.000217,-0.000217,0.000218,-0.000219,0.00022,-0.00022,0.000221,-0.000221,0.000215,-0.000216,0.000216,-0.000217,0.000218,-0.000218,0.000219,-0.00022,0.00022,-0.000221,0.000222,-0.000222,0.000223,-0.000224,0.000224,-0.000225,0.000226,-0.000226,0.000227,-0.000227,0.000228,-0.000229,0.000229,-0.00023,0.000231,-0.000231,0.000232,-0.000232,0.000233,-0.000234,0.000234,-0.000235,0.000235,-0.000236,0.000237,-0.000238,0.000238,-0.000239,0.000239,-0.00024,0.000241,-0.000241,0.000242,-0.000243,0.000243,-0.000244,0.000244,-0.000245,0.000246,-0.000246,0.000247,-0.000248,0.000248,-0.000249,0.000249,-0.00025,0.000251,-0.000252,0.000252,-0.000253,0.000253,-0.000254,0.000255,-0.000255,0.000256,-0.000257,0.000257,-0.000258,0.000258,-0.000259,0.00026,-0.00026,0.000261,-0.000262,0.000262,-0.000263,0.000263,-0.000264,0.000265,-0.000266,0.000266,-0.000267,0.000267,-0.000268,0.000268,-0.000269,0.00027,-0.00027,0.000271,-0.000264,0.000264,-0.000265,0.000265,-0.000266,0.000266,-0.000267,0.000268,-0.000268,0.000269,-0.00027,0.00027,-0.000271,0.000271,-0.000272,0.000273,-0.000273,0.000274,-0.000274,0.000275,-0.000276,0.000276,-0.000277,0.000277,-0.000278,0.000279,-0.000279,0.00028,-0.000281,0.000281,-0.000282,0.000283,-0.000283,0.000284,-0.000284,0.000285,-0.000285,0.000286,-0.000287,0.000287,-0.000288,0.000289,-0.000289,0.00029,-0.00029,0.000291,-0.000292,0.000292,-0.000293,0.000293,-0.000294,0.000294,-0.000295,0.000296,-0.000296,0.000297,-0.000297,0.000298,-0.000298,0.000299,-0.0003,0.0003,-0.000301,0.000302,-0.000302,0.000303,-0.000304,0.000304,-0.000305,0.000305,-0.000306,0.000306,-0.000307,0.000307,-0.000308,0.000309,-0.000309,0.00031,-0.000311,0.000311,-0.000312,0.000312,-0.000313,0.000313,-0.000314,0.000315,-0.000315,0.000316,-0.000316,0.000337,-0.000338,0.000338,-0.000339,0.000339,-0.00034,0.000341,-0.000341,0.000342,-0.000342,0.000343,-0.000343,0.000344,-0.000345,0.000345,-0.000346,0.000346,-0.000347,0.000348,-0.000348,0.000349,-0.00035,0.00035,-0.000351,0.000351,-0.000352,0.000353,-0.000353,0.000354,-0.000354,0.000355,-0.000355,0.000356,-0.000357,0.000357,-0.000358,0.000358,-0.000359,0.000359,-0.00036,0.000361,-0.000361,0.000362,-0.000362,0.000363,-0.000364,0.000364,-0.000365,0.000365,-0.000366,0.000366,-0.000367,0.000367,-0.000368,0.000368,-0.000369,0.000369,-0.000371,0.000371,-0.000372,0.000372,-0.000373,0.000373,-0.000374,0.000374,-0.000375,0.000375,-0.000376,0.000376,-0.000377,0.000378,-0.000378,0.000379,-0.000379,0.00038,-0.00038,0.000381,-0.000381,0.000382,-0.000382,0.000383,-0.000383,0.000384,-0.000384,0.000385,-0.000385,0.000386,-0.000386,0.000387,-0.000387,0.000388,-0.000388,0.000389,-0.000389,0.00039,-0.00039,0.000391,-0.000392,0.000392,-0.000392,0.000393,-0.000394,0.000394,-0.000394,0.000395,-0.000395,0.000396,-0.000397,0.000397,-0.000397,0.000398,-0.000399,0.000399,-0.000399,0.0004,-0.0004,0.000401,-0.000401,0.000402,-0.000402,0.000403,-0.000403,0.000404,-0.000404,0.000405,-0.000405,0.000405,-0.000406,0.000406,-0.000407,0.000407,-0.000408,0.000408,-0.000409,0.000409,-0.000409,0.00041,-0.00041,0.000411,-0.000411,0.000412,-0.000412,0.000412,-0.000413,0.000413,-0.000414,0.000414,-0.000415,0.000415,-0.000415,0.000416,-0.000416,0.000417,-0.000417,0.000417,-0.000418,0.000418,-0.000418,0.000419,-0.000419,0.00042,-0.00042,0.000421,-0.000421,0.000421,-0.000422,0.000422,-0.000422,0.000423,-0.000423,0.000424,-0.000424,0.000424,-0.000425,0.000425,-0.000425,0.000426,-0.000426,0.000426,-0.000427,0.000427,-0.000427,0.000428,-0.000428,0.000428,-0.000429,0.000429,-0.00043,0.00043,-0.00043,0.000431,-0.000431,0.000431,-0.000431,0.000432,-0.000432,0.000432,-0.000433,0.000433,-0.000433,0.000434,-0.000434,0.000434,-0.000434,0.000435,-0.000435,0.000435,-0.000436,0.000436,-0.000436,0.000437,-0.000437,0.000437,-0.000437,0.000438,-0.000438,0.000438,-0.000438,0.000438,-0.000439,0.000439,-0.000439,0.000439,-0.00044,0.00044,-0.00044,0.00044,-0.000441,0.000441,-0.000441,0.000441,-0.000442,0.000442,-0.000442,0.000442,-0.000442,0.000443,-0.000443,0.000443,-0.000443,0.000443,-0.000444,0.000444,-0.000444,0.000444,-0.000444,0.000445,-0.000445,0.000445,-0.000445,0.000445,-0.000445,0.000445,-0.000446,0.000446,-0.000446,0.000446,-0.000446,0.000446,-0.000447,0.000447,-0.000447,0.000447,-0.000447,0.000447,-0.000447,0.000447,-0.000448,0.000448,-0.000448,0.000448,-0.000448,0.000448,-0.000448,0.000448,-0.000448,0.000448,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.00045,0.00045,-0.00045,0.00045,-0.000449,0.00045,-0.00045,0.000449,-0.00045,0.00045,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000449,0.000449,-0.000448,0.000448,-0.000448,0.000448,-0.000448,0.000448,-0.000448,0.000448,-0.000448,0.000447,-0.000447,0.000447,-0.000447,0.000447,-0.000447,0.000447,-0.000447,0.000446,-0.000446,0.000446,-0.000446,0.000446,-0.000446,0.000445,-0.000445,0.000445,-0.000445,0.000445,-0.000444,0.000444,-0.000444,0.000444,-0.000444,0.000443,-0.000443,0.000443,-0.000443,0.000443,-0.000442,0.000442,-0.000442,0.000442,-0.000441,0.000441,-0.000441,0.000441,-0.00044,0.00044,-0.00044,0.00044,-0.000439,0.000439,-0.000439,0.000438,-0.000438,0.000438,-0.000438,0.000437,-0.000437,0.000437,-0.000436,0.000436,-0.000436,0.000435,-0.000435,0.000435,-0.000434,0.000434,-0.000434,0.000433,-0.000433,0.000433,-0.000432,0.000432,-0.000431,0.000431,-0.000431,0.00043,-0.00043,0.00043,-0.000429,0.000429,-0.000428,0.000428,-0.000428,0.000427,-0.000427,0.000426,-0.000426,0.000425,-0.000425,0.000424,-0.000424,0.000424,-0.000423,0.000423,-0.000422,0.000422,-0.000421,0.000421,-0.00042,0.00042,-0.000419,0.000419,-0.000418,0.000418,-0.000417,0.000417,-0.000416,0.000416,-0.000415,0.000415,-0.000414,0.000414,-0.000413,0.000413,-0.000412,0.000412,-0.000411,0.00041,-0.00041,0.000409,-0.000409,0.000408,-0.000408,0.000407,-0.000406,0.000406,-0.000405,0.000405,-0.000404,0.000403,-0.000403,0.000402,-0.000401,0.000401,-0.0004,0.000399,-0.000399,0.000398,-0.000398,0.000397,-0.000396,0.000396,-0.000395,0.000394,-0.000394,0.000393,-0.000392,0.000391,-0.000391,0.00039,-0.000389,0.000389,-0.000388,0.000387,-0.000387,0.000386,-0.000385,0.000384,-0.000384,0.000383,-0.000382,0.000381,-0.000381,0.00038,-0.000379,0.000378,-0.000378,0.000377,-0.000376,0.000375,-0.000374,0.000374,-0.000373,0.000372,-0.000371,0.00037,-0.00037,0.000369,-0.000368,0.000367,-0.000366,0.000366,-0.000364,0.000364,-0.000363,0.000362,-0.000361,0.00036,-0.000359,0.000359,-0.000358,0.000357,-0.000356,0.000355,-0.000354,0.000353,-0.000352,0.000351,-0.000351,0.00035,-0.000349,0.000348,-0.000347,0.000346,-0.000345,0.000344,-0.000343,0.000342,-0.000341,0.00034,-0.000339,0.000338,-0.000337,0.000336,-0.000335,0.000334,-0.000333,0.000332,-0.000331,0.00033,-0.000329,0.000328,-0.000327,0.000326,-0.000325,0.000324,-0.000323,0.000322,-0.000321,0.00032,-0.000319,0.000318,-0.000317,0.000316,-0.000315,0.000314,-0.000313,0.000312,-0.000311,0.00031,-0.000309,0.000307,-0.000306,0.000305,-0.000304,0.000303,-0.000302,0.000301,-0.0003,0.000298,-0.000297,0.000296,-0.000295,0.000294,-0.000293,0.000292,-0.000291,0.000289,-0.000288,0.000287,-0.000286,0.000284,-0.000284,0.000282,-0.000281,0.00028,-0.000279,0.000277,-0.000276,0.000275,-0.000274,0.000273,-0.000272,0.00027,-0.000269,0.000268,-0.000267,0.000265,-0.000264,0.000263,-0.000262,0.00026,-0.000259,0.000258,-0.000257,0.000256,-0.000254,0.000253,-0.000252,0.00025,-0.000249,0.000248,-0.000246,0.000245,-0.000244,0.000243,-0.000241,0.00024,-0.000239,0.000237,-0.000236,0.000235,-0.000234,0.000232,-0.000231,0.00023,-0.000228,0.000227,-0.000225,0.000224,-0.000223,0.000221,-0.00022,0.000219,-0.000217,0.000216,-0.000215,0.000213,-0.000212,0.000211,-0.000209,0.000208,-0.000206,0.000205,-0.000204,0.000202,-0.000201,0.0002,-0.000198,0.000196,-0.000195,0.000194,-0.000192,0.000191,-0.000189,0.000188,-0.000187,0.000185,-0.000184,0.000182,-0.000181,0.00018,-0.000178,0.000177,-0.000175,0.000174,-0.000172,0.000171,-0.000169,0.000168,-0.000166,0.000165,-0.000163,0.000162,-0.00016,0.000159,-0.000157,0.000156,-0.000155,0.000153,-0.000152,0.00015,-0.000149,0.000147,-0.000146,0.000144,-0.000142,0.000141,-0.000139,0.000138,-0.000136,0.000135,-0.000133,0.000132,-0.00013,0.000129,-0.000127,0.000126,-0.000124,0.000123,-0.000121,0.00012,-0.000118,0.000117,-0.000115,0.000113,-0.000112,0.00011,-0.000109,0.000107,-0.000106,0.000104,-0.000103,0.000101,-0.000099,0.000098,-0.000096,0.000095,-0.000093,0.000092,-0.00009,0.000089,-0.000087,0.000085,-0.000083,0.000082,-0.00008,0.000079,-0.000077,0.000076,-0.000074,0.000073,-0.000071,0.000069,-0.000068,0.000066,-0.000065,0.000063,-0.000062,0.00006,-0.000057,0.000055,-0.000053,0.000052,-0.00005,0.000049,-0.000047,0.000045,-0.000044,0.000042,-0.000041,0.000039,-0.000038,0.000036,-0.000035,0.000033,-0.000032,0.00003,-0.000029,0.000027,-0.000025,0.000024,-0.000022,0.000021,-0.000019,0.000017,-0.000016,0.000014,-0.000013,0.000011,-0.00001,0.000008,-0.000006,0.000005,-0.000003,0.000002,0,-0.000001,0.000003,-0.000004,0.000006,-0.000007,0.000009,-0.000011,0.000012,-0.000014,0.000015,-0.000017,0.000019,-0.00002,0.000022,-0.000023,0.000025,-0.000027,0.000028,-0.00003,0.000031,-0.000033,0.000034,-0.000036,0.000038,-0.000039,0.00004,-0.000042,0.000043,-0.000045,0.000047,-0.000048,0.00005,-0.000051,0.000053,-0.000054,0.000056,-0.000058,0.000059,-0.000061,0.000062,-0.000064,0.000065,-0.000067,0.000069,-0.00007,0.000072,-0.000073,0.000075,-0.000076,0.000078,-0.000079,0.00008,-0.000082,0.000084,-0.000085,0.000087,-0.000088,0.00009,-0.000091,0.000093,-0.000094,0.000096,-0.000097,0.000099,-0.0001,0.000102,-0.000104,0.000105,-0.000107,0.000108,-0.00011,0.000111,-0.000113,0.000114,-0.000116,0.000117,-0.000118,0.00012,-0.000121,0.000123,-0.000124,0.000126,-0.000127,0.000129,-0.00013,0.000131,-0.000133,0.000134,-0.000136,0.000137,-0.000139,0.00014,-0.000142,0.000143,-0.000145,0.000146,-0.000147,0.000149,-0.00015,0.000152,-0.000153,0.000155,-0.000156,0.000157,-0.000159,0.00016,-0.000161,0.000163,-0.000164,0.000166,-0.000167,0.000168,-0.00017,0.000171,-0.000172,0.000174,-0.000175,0.000177,-0.000178,0.000179,-0.000181,0.000182,-0.000183,0.000185,-0.000186,0.000187,-0.000189,0.00019,-0.000191,0.000192,-0.000194,0.000195,-0.000196,0.000198,-0.000199,0.0002,-0.000202,0.000203,-0.000204,0.000205,-0.000206,0.000208,-0.000209,0.00021,-0.000212,0.000213,-0.000214,0.000215,-0.000216,0.000218,-0.000219,0.00022,-0.000221,0.000223,-0.000223,0.000225,-0.000226,0.000227,-0.000228,0.000229,-0.000231,0.000232,-0.000233,0.000234,-0.000235,0.000236,-0.000237,0.000239,-0.00024,0.000241,-0.000242,0.000243,-0.000244,0.000245,-0.000246,0.000247,-0.000248,0.000242,-0.000243,0.000244,-0.000245,0.000246,-0.000247,0.000248,-0.000249,0.00025,-0.000251,0.000252,-0.000253,0.000254,-0.000255,0.000256,-0.000257,0.000257,-0.000258,0.000259,-0.00026,0.000261,-0.000262,0.000263,-0.000264,0.000265,-0.000266,0.000266,-0.000267,0.000268,-0.000269,0.00027,-0.000271,0.000272,-0.000272,0.000273,-0.000274,0.000275,-0.000276,0.000277,-0.000277,0.000278,-0.000279,0.00028,-0.00028,0.000281,-0.000282,0.000283,-0.000283,0.000284,-0.000285,0.000285,-0.000286,0.000287,-0.000288,0.000288,-0.000289,0.00029,-0.00029,0.000291,-0.000291,0.000292,-0.000293,0.000293,-0.000294,0.000295,-0.000295,0.000296,-0.000297,0.000297,-0.000298,0.000298,-0.000299,0.000299,-0.0003,0.0003,-0.000301,0.000301,-0.000302,0.000302,-0.000303,0.000303,-0.000304,0.000304,-0.000305,0.000305,-0.000306,0.000306,-0.000307,0.000307,-0.000307,0.000308,-0.000308,0.000309,-0.000309,0.000309,-0.00031,0.00031,-0.00031,0.000311,-0.000311,0.000311,-0.000312,0.000312,-0.000312,0.000313,-0.000313,0.000313,-0.000313,0.000314,-0.000314,0.000314,-0.000314,0.000315,-0.000315,0.000315,-0.000315,0.000316,-0.000316,0.000316,-0.000316,0.000316,-0.000316,0.000316,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000317,0.000317,-0.000316,0.000316,-0.000316,0.000316,-0.000316,0.000316,-0.000315,0.000315,-0.000315,0.000315,-0.000315,0.000314,-0.000314,0.000314,-0.000314,0.000313,-0.000313,0.000313,-0.000313,0.000312,-0.000312,0.000312,-0.000311,0.000311,-0.000311,0.00031,-0.00031,0.000309,-0.000309,0.000309,-0.000308,0.000308,-0.000307,0.000307,-0.000307,0.000306,-0.000306,0.000305,-0.000305,0.000304,-0.000304,0.000303,-0.000303,0.000302,-0.000302,0.000301,-0.000301,0.0003,-0.0003,0.000299,-0.000298,0.000298,-0.000297,0.000297,-0.000296,0.000295,-0.000295,0.000294,-0.000293,0.000293,-0.000292,0.000291,-0.000291,0.00029,-0.000289,0.000289,-0.000288,0.000287,-0.000286,0.000286,-0.000285,0.000284,-0.000283,0.000282,-0.000282,0.000281,-0.00028,0.000279,-0.000279,0.000278,-0.000277,0.000276,-0.000275,0.000274,-0.000273,0.000273,-0.000272,0.000271,-0.00027,0.000269,-0.000268,0.000267,-0.000266,0.000265,-0.000227,0.000226,-0.000225,0.000224,-0.000223,0.000222,-0.000222,0.000221,-0.00022,0.000219,-0.000218,0.000217,-0.000216,0.000215,-0.000214,0.000213,-0.000212,0.000211,-0.00021,0.00021,-0.000209,0.000208,-0.000207,0.000206,-0.000205,0.000204,-0.000203,0.000202,-0.000201,0.0002,-0.000199,0.000198,-0.000197,0.000196,-0.000194,0.000193,-0.000192,0.000191,-0.00019,0.000189,-0.000188,0.000187,-0.000186,0.000185,-0.000183,0.000182,-0.000181,0.00018,-0.000179,0.000178,-0.000177,0.000176,-0.000174,0.000173,-0.000172,0.000171,-0.00017,0.000169,-0.000167,0.000166,-0.000165,0.000164,-0.000163,0.000161,-0.00016,0.000159,-0.000158,0.000156,-0.000155,0.000154,-0.000153,0.000151,-0.00015,0.000149,-0.000148,0.000146,-0.000145,0.000144,-0.000142,0.000141,-0.00014,0.000139,-0.000137,0.000136,-0.000134,0.000133,-0.000132,0.00013,-0.000129,0.000128,-0.000127,0.000125,-0.000124,0.000122,-0.000121,0.000119,-0.000118,0.000117,-0.000115,0.000114,-0.000113,0.000111,-0.00011,0.000108,-0.000107,0.000106,-0.000104,0.000103,-0.000101,0.0001,-0.000098,0.000097,-0.000095,0.000094,-0.000093,0.000091,-0.00009,0.000088,-0.000087,0.000085,-0.000084,0.000082,-0.000081,0.000079,-0.000078,0.000076,-0.000075,0.000073,-0.000072,0.00007,-0.000069,0.000067,-0.000066,0.000064,-0.000063,0.000061,-0.00006,0.000058,-0.000057,0.000055,-0.000054,0.000052,-0.000051,0.000049,-0.000048,0.000046,-0.000045,0.000043,-0.000042,0.00004,-0.000039,0.000037,-0.000036,0.000034,-0.000033,0.000031,-0.00003,0.000028,-0.000026,0.000025,-0.000023,0.000022,-0.00002,0.000019,-0.000017,0.000015,-0.000014,0.000012,-0.000011,0.000009,-0.000008,0.000006,-0.000004,0.000003,-0.000001]};

    const g = table => {
        const real = new Float32Array(table.real);
        const imag = new Float32Array(table.imag);
        if(audioCtx){
            return audioCtx.createPeriodicWave(real,imag);
        }
        return 0;
    }
    const custom = amplitudes => {
        return audioCtx.createPeriodicWave(new Float32Array(amplitudes),new Float32Array(amplitudes.length));
    }
    return({
        fuzzyGuitar:g(fuzzyGuitar),
        brass:g(brass),
        trombone:g(trombone),
        piano:g(piano),
        triangle:g(triangle),
        custom:custom
    })
})
},{}]},{},[1,2,3,4,5,6,7,8,9,10,11,12,13,45,46,47,48,49,50]);
