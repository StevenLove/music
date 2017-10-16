var teoria = require("teoria");
var piano = require("./piano.js");
var Converter = require("./converter.js");
var TimbreControls = require("./timbreControls.js");
var OtherInterpretationsOfNotes = require("./otherInterpretationsOfNotes.js");
var AudioPlayer = require("./audioplayer.js");
var Fourier = require("./fourier.js");

const showRecentNotes = () => {
    console.log("setup");
    piano.onPlayNote(()=>{
        console.log("played note");
        const notes = piano.getRecentNotes(4);
        const descriptions = notes.map(Converter.frequencyToName)
        $("#currentNote").text(descriptions.toString());
    })
}
const on = (char,f) => {
    const charcode = char.charCodeAt(0);
    const keycode = charcode - 97 + 65;
    $("body").keydown(e=>{
        if(e.keyCode == keycode){
            f();
        }
    })
}

const setVowelControls = () => {
    const onV = (char,vowel)=>{
        on(char,()=>AudioPlayer.setVowel(vowel));
    }
    
    onV("q","ow");
    onV("w","oo");
    onV("e","u");
    onV("r","a");
    onV("t","uh");
    onV("y","er");
    onV("u","ae");
    onV("i","e");
    // onV("o","i");
    onV("o","m");
    onV("p","iy");
}



$(document).ready(()=>{
    OtherInterpretationsOfNotes.setup();
    TimbreControls.setup();
    piano.setup();
    setVowelControls();
    showRecentNotes();
})
