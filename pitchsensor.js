var Microphone = require("./microphone.js");
var Visualizer = require("./visualizer.js");
var WebAudio = require("./webaudio.js");

const PitchSensor = (()=>{
    const audioCtx = WebAudio.getContext();
    const visualizer = Visualizer();    



    /* needs to be done after page is loaded */
    const init = () => {
        Microphone.init();
        Microphone.enable();

        Microphone.onStreamOpened(()=>{
            console.log("on stream opened");
            /* Create Nodes */
            const stream = Microphone.getNode();
            const visualizerNode = visualizer.getNode();
            const muteNode = WebAudio.createMuteNode();
            const speakers = audioCtx.destination
            /* Connect Nodes */
            stream.connect(visualizerNode);
            visualizerNode.connect(muteNode);
            muteNode.connect(speakers);

            setInterval(()=>{
                console.log(visualizer.getAnalyserBuffer());
            },1000);
        })
    }



    return ({
        init:init,
    })
})()

module.exports = PitchSensor;