const WebAudio = (()=>{

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(!audioCtx){
        throw "AudioPlayer Error: your browser doesn't support web audio";
    }

    /* For use in connecting nodes but not actually allowing any sound to go through them */
    const createMuteNode = () => {
        const muteNode = audioCtx.createGain();
        muteNode.gain.value = 0;
        return muteNode;
    }
    return({
        getContext:()=>audioCtx,
        createMuteNode:createMuteNode
    })
})()

module.exports = WebAudio;