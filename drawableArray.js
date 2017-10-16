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