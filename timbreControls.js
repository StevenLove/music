const piano = require("./piano.js");
const Converter = require("./converter.js");
const AudioPlayer = require("./audioplayer.js");

const TimbreControls = (()=>{
    const setupVolumeComponent = () => {
        $("#volume").val(15);
        $("#volume").on("change",function(){
            AudioPlayer.setVolume(parseInt($(this).val()))
        })
    }
    const setupTimbreComponent = () => {
        const updateHarmonicAmplitudes = () => {
            $("#harmonicAmplitudes input").each(function(index){
                AudioPlayer.setAmplitude(index+1,$(this).val());
                AudioPlayer.setWaveTable("custom");
                $("#waveTableDropdown").val("custom");
            })
        }
        updateHarmonicAmplitudes();
        $("#harmonicAmplitudes input").on("change",function(){
            updateHarmonicAmplitudes();
        })
    }
    const setupWaveTableDropdown = () => {
        Object.keys(WaveTables()).forEach(key=>{
            $("#waveTableDropdown").append($("<option>"+key+"</option>").val(key))
        })
        
        $("#waveTableDropdown").on("change",function(){
            const v = $("#waveTableDropdown").val()
            AudioPlayer.setWaveTable(v);
            if(v == "custom"){
                $("#harmonicAmplitudes").show();
            }
            else{
                $("#harmonicAmplitudes").hide();
            }
        })
    }
    const setupCurrentScale = () => {
        const updateDisplay = () => {
            $("#currentMode").text(piano.getMode());
            $("#currentRoot").text(Converter.frequencyToName(piano.getRoot()));
            $("#currentIntervals").val(piano.getIntervals().join(" "));
            console.log("update display called");
            $("#currentScale").text(piano.getScale().toString());
            const handleUpdateIntervals = () => {
                piano.setIntervals($("#currentIntervals").val().split(/\s+/).filter(name=>name.length>0));
            }
            $("#currentIntervals").on("keydown",e=>{
                if(e.keyCode==13){
                    handleUpdateIntervals();
                    $("#currentIntervals").blur();
                }
            })
            $("#currentIntervalsButton").on("click",handleUpdateIntervals);
        }
        updateDisplay();
        piano.onChangeSettings(updateDisplay);
    }
    const setupCurrentDetuning = () => {
        const updateCurrentDetuning = () => {
            const detuning = parseInt($("#currentDetuning").val());
            piano.setDetuning(detuning);
        }
        $("#currentDetuning").on("change",updateCurrentDetuning);
        $("#currentDetuning").val(0);
    }
    const setup = () => {
        setupVolumeComponent();
        setupWaveTableDropdown();
        setupTimbreComponent();
        setupCurrentScale();
        setupCurrentDetuning();
        
    }
    /****************/
    return({
        setup:setup
    })
})()

module.exports = TimbreControls;