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
