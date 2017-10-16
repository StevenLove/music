
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