const WebAudio = require("./webaudio.js");
const Visualizer = (()=>{

    const width = 1024;
    const height = 300;

    const audioCtx = WebAudio.getContext();
    const analyserNode = audioCtx.createAnalyser();
    const bufferLength = analyserNode.frequencyBinCount;
    analyserNode.fftSize = 1024;
    const analyserBuffer = new Uint8Array(bufferLength);

    var $canvas;

    const visualizer = () => {
        const WIDTH = 400;
        const HEIGHT = 200;
        $canvas = $("<canvas>").attr("width",WIDTH).attr("height",HEIGHT);
        const canvas = $canvas[0];
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "black";
        ctx.clearRect(0,0,WIDTH,HEIGHT);
        const draw = () => {
            requestAnimationFrame(draw);
            analyserNode.getByteFrequencyData(analyserBuffer); // update data in analyserBuffer
            ctx.fillStyle = "black";
            ctx.fillRect(0,0,WIDTH,HEIGHT);
            var barWidth = (WIDTH / bufferLength) * 2.5;
            var barHeight;
            var x = 0;
            for(var i = 0; i < bufferLength; ++i){
                barHeight = analyserBuffer[i]/2;
                ctx.fillStyle = 'rgb('+(barHeight+100) + ',50,50)';
                ctx.fillRect(x,HEIGHT-barHeight/2, barWidth,barHeight);
                x += barWidth + 1;
            }
        }
        draw();
        $(document).ready(()=>{
            $("#displays").append($canvas);
            $("#displays").append($("<hr>"));
        })
        
    }

    visualizer();
    const getNode = () => analyserNode;
    const getElement = () => $canvas;
    const getAnalyserBuffer = () => analyserBuffer;

    return ({
        getNode:getNode,
        getAnalyserBuffer:getAnalyserBuffer,
        getElement: getElement
    })


})

module.exports = Visualizer;