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
        playScaleDegree(d);
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

    const playScaleDegree = degree => {
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
            $("body").keydown(e=>{
                if(e.key == char){
                    f();
                }
            })
        }

        // $("body").keydown(onKeyDownOrUp).keyup(onKeyDownOrUp);    

    }
    

    return ({
        playScaleDegree: playScaleDegree,
        stopScaleDegree: stopScaleDegree,

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