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