var Converter = require("./converter.js");
var Scorer = require("./scorer.js");

const OtherInterpretationsOfNotes = (()=>{

    /* Input: an array of pitch classes represented as semitones above the root
       Output: an array of arrays of pitch classes represented as semitones above the root
       Each array here represents the same series of notes, but in reference from a different root
       For instance, the input of [1,4,6] gives the following outputs:
       [1,4,6],[b2,b5,b7],[2,5,7],[b3,b6,1],[3,6,b2],[4,b7,2],
       [b5,7,b3],[5,1,3],[b6,b2,4],[6,2,b5],[b7,b3,5],[7,3,b6]
       You can look at these equivalent progressions and notice some roots
       whose perspectives make the most sense.  In this case, we see that 
       placing the root at the "4" of the original interpretation yields a 
       [5,1,3] which seems to imply that this is how we will hear the notes*/
    const couldBe = semitones => {
        const possibilities = [];
        possibilities.push(semitones);
        for(var i = 1 ; i < 12; ++i){
            semitones = semitones.map(Converter.incrementIntervalClass)
            possibilities.push(semitones)        
        }
        return possibilities;
    }



    const showOtherInterpretations = names => {
        const semitones = names.map(Converter.simpleNameToSemitones);
        const possibilities = couldBe(semitones);
        const scores = possibilities.map(Scorer.dissonanceOfIntervalClassChord);

        $("#otherInterpretations tbody").empty();
        possibilities.forEach((possibility,index)=>{
            const description = possibility.map(Converter.semitonesToSimpleName).toString();
            const score = scores[index].toFixed(1);
            console.log(description,score);
            $("#otherInterpretations tbody").append(
                $("<tr><td>"+description+"&nbsp;&nbsp;</td><td>"+score+"</td></tr>")
            )
        })
    }
    const setup = () => {
        const handleSubmission = () => {
            const input = $("#scaleDegrees").val();
            const names = input.split(/\s+/).filter(name=>name);
            console.log("names",names);
            showOtherInterpretations(names);
        }
        $("#scaleDegreesButton").on("click",handleSubmission);
        $("#scaleDegrees").on("keydown",e=>{
            if(e.keyCode == 13){
                // enter was pressed
                handleSubmission();
            }
        })
    }
    return ({
        setup:setup
    })
})();

module.exports = OtherInterpretationsOfNotes;