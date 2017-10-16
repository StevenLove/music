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
