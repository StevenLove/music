const AudioPlayer = require("./audioplayer.js");
var shortTimeFT = require("stft");

const Fourier = (()=>{

    const width = 1024;
    const height = 300;

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
    })

    drawable.onChange(()=>{
        const arr = drawable.getArray();
        stft(arr);
    })

})()

module.exports = Fourier;