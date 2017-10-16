// for a chord, determine which keys it could be in
// determine the notes of the chord
// both a scale and a chord are represented by a root note (0-11) along with a series of intervals
// then we can compare our sets of notes
// but we would do a lot of extra comparisons
// we could just compare the interval sets against each other... but that also requires rotating the intervals


const assertIn = (item,list) => {
    if(!list.includes(item)){
        throw JSON.stringify(item) + " not found in " + JSON.stringify(list);
    }
}
const assert = (bool,msg) => {
    if(!bool) throw msg
}

const isSubset = (superset,subset) => {
    for(var i = 0; i < subset.length; ++i){
        if(!superset.includes(subset[i]))return false;
    }
    return true;
}
const isEqualSet = (setA,setB) => {
    return isSubset(setA,setB) && isSubset(setB,setA);
}
const intersect = (setA,setB)=>{
    return setA.filter(el=>setB.includes(el))
}

const NUM_NOTES = 12;
const ALL_NOTES = [0,1,2,3,4,5,6,7,8,9,10,11]

const CHORD_INTERVALS = {
    MAJOR: [4,3,5],
    MINOR: [3,4,5],
    DIMINISHED: [3,3,6],
    MAJ7: [4,3,4,1],
    DOM7: [4,3,3,2],
    DIM7: [3,3,3,3],
    MINOR7:[3,4,3,2],
    MINORMAJOR7:[3,4,4,1],
    AUGMENTED7:[4,4,3,1],
    HALF_DIMINISHED:[3,3,4,2]
}
const CHORD = CHORD_INTERVALS;

const SCALE_INTERVALS = {
    MAJOR: [2,2,1,2,2,2,1],
    HARMONIC_MINOR: [2,1,2,2,1,3,1]
    // BEBOP_MAJOR: [2,2,1,2,1,1,2,1] // 8 notes...
}

const SCALE_DEGREE_SEMITONES = {
    1:0,
    2:2,
    3:4,
    4:5,
    5:7,
    6:9,
    7:11
}
const ROMAN_NUMERAL_VALUES = {
    i:1,
    I:1,
    ii:2,
    II:2,
    iii:3,
    III:3,
    iv:4,
    IV:4,
    v:5,
    V:5,
    vi:6,
    VI:6,
    vii:7,
    VII:7
}

const FLAT_SHARP_VALUES = {
    "#": 1,
    "b": -1,
    "": 0
}

const C = 0;
const Cs = 1;
const Db = 1;
const D = 2;
const Ds = 3;
const Eb = 3;
const E = 4;
const F = 5;
const Fs = 6;
const Gb = 6;
const G = 7;
const Gs = 8;
const Ab = 8;
const A = 9;
const As = 10;
const Bb = 10;
const B = 11;

const NOTE_STRINGS = {
    "C":  0,
    "C#": 1,
    "Db": 1,
    "D":  2,
    "D#": 3,
    "Eb": 3,
    "E":  4,
    "F":  5,
    "F#": 6,
    "Gb": 6,
    "G":  7,
    "G#": 8,
    "Ab": 8,
    "A":  9,
    "A#": 10,
    "Bb": 10,
    "B":  11
}

const JUST_FREQUENCY_RATIOS = {
    0:1,
    1:16/15,
    2:9/8,
    3:6/5,
    4:5/4,
    5:4/3,
    6:45/32,
    7:3/2,
    8:8/5,
    9:5/3,
    10:9/5,
    11:15/8
}

const MIDDLE_C_FREQUENCY = 200;

const JUST_FREQUENCIES = Object.keys(JUST_FREQUENCY_RATIOS).reduce((acc,note)=>{
    const freq = MIDDLE_C_FREQUENCY * JUST_FREQUENCY_RATIOS[note];
    acc[note]=freq;
    return acc;
},{})

const COMMON_NAME = {
    0:"C",
    1:"C#",
    2:"D",
    3:"Eb",
    4:"E",
    5:"F",
    6:"Gb",
    7:"G",
    8:"Ab",
    9:"A",
    10:"Bb",
    11:"B"
}



const Enumerator = (()=>{
    var all_scales;
    var note_tree;
    var buncha_chords = [];
    const enumerateScales = ()=>{
        return Object.keys(SCALE_INTERVALS).reduce((acc,curr)=>{
            for(var note = 0; note < NUM_NOTES; ++note){
                // var name = COMMON_NAME[note] + " " + curr;
                var set = NoteSet.fromRootAndIntervals(note,SCALE_INTERVALS[curr]);
                // acc[name] = set;
                acc.push(set);
            }
            return acc;
        },[])    
    }
    const getScales = ()=>{
        if(all_scales)return all_scales;
        all_scales = enumerateScales();
        return all_scales;
    }
    const generateNoteSetTree = function(startingWith,prefix){
        if(startingWith >= NUM_NOTES){
            buncha_chords.push(prefix);
            return;
        }
        return {
            left: generateNoteSetTree(startingWith+1,[...prefix,startingWith]),
            right:generateNoteSetTree(startingWith+1,prefix)
        }
    }
    const getNoteTree = () => {
        if(note_tree)return buncha_chords;
        note_tree = "gotcha";
        generateNoteSetTree(0,[]);
        return buncha_chords;
    }

    return({
        scales:getScales,
        noteTree:getNoteTree
    })
})()

const Name = (()=>{
    const nameNotes = notes => {
        return notes.reduce((acc,curr)=>{
            const str = COMMON_NAME[curr];
            acc.push(str);
            return acc
        },[]).join(",");
    }
    const nameSet = set => {
        return nameNotes(NoteSet.toNotes(set));
    }
    const nameScale = scale => nameFromIntervals(scale,SCALE_INTERVALS);
    const nameChord = chord => nameFromIntervals(chord,CHORD_INTERVALS);
    const nameFromIntervals = (set,intervalList) => {
        const setNames = Object.keys(intervalList);
        for(var note = 0; note < NUM_NOTES; ++note){
            for(var i = 0; i < setNames.length; ++i){
                const setName = setNames[i];
                const generatedSet = NoteSet.fromRootAndIntervals(note,intervalList[setName]);
                if(generatedSet == set){
                    return COMMON_NAME[note] + " " + setName;
                }
            }
        }
        return "Unknown";
    }
    return ({
        notes:nameNotes,
        chord:nameChord,
        set:nameSet,
        scale:nameScale
    })
})()

const Note = {plus:(a,b)=>(a+b)%NUM_NOTES};

const NoteSet = (()=>{
    const chordValue = {
        11:2048, //B
        10:1024,
        9:512, //A
        8:256,
        7:128, //G
        6:64,
        5:32, //F
        4:16, //E
        3:8,
        2:4, //D
        1:2,
        0:1 //C
    }
    const blank = {
        0:0,
        1:0,
        2:0,
        3:0,
        4:0,
        5:0,
        6:0,
        7:0,
        8:0,
        9:0,
        10:0,
        11:0
    }
    const scratchPad = {
    };

    // input notes as separate arguments or one array
    // input F,A,C,E to convey Fmaj7
    // input [A,Cs,E] to convey an A minor
    // input A,Db,E to convey an A minor
    const fromNotes = (...notes)=>{
        // it's definitely an array
        // input () => []
        // input [] => [[]]
        // input (A,B) => [A,B]
        // input [A,B] => [[A,B]]
        if(Array.isArray(notes[0])){
            // an array was input, so we'll unwrap it
            notes = notes[0];
        }
        return fromNoteArray(notes);
       
    }
    // input [F,A,C,E] to convey an FMaj7
    // input [A,Cs,E] to convey an A minor
    // input [A,Db,E] to convey an A minor
    const fromNoteArray = notes => {
        Object.assign(scratchPad,blank);
        notes.forEach(note=>scratchPad[note]=1)
        return Object.keys(scratchPad).reduce((acc,currKey)=>{
            const val = scratchPad[currKey] * chordValue[currKey];
            return acc+val;
        },0)
    }
    // input: "F A C E" to convey an FMaj7
    // input: "A C# E" to convey an A minor
    // input: "A Db E" to convey an A minor
    const fromNoteString = string => {
        strings = string.split(" ").filter(string=>string.length>0);
        notes = strings.map(str=>NOTE_STRINGS[str])
        return fromNoteArray(notes);
    }
    const fromRootAndIntervals = (note,intervals)=>{
        const sum = (a,b)=>a+b;
        const notes = intervals.reduce((acc,curr_interval)=>{
            const prev_note = acc[acc.length-1];
            const curr_note = (prev_note + curr_interval)%NUM_NOTES;
            acc.push(curr_note);
            return acc;
        },[note]);
        return fromNotes(...notes);
    }
    const setToNotes = set => {
        var total = 0;
        const notes = [];
        for(var note = 0; note < NUM_NOTES; ++note){
            var present = (set >> note) & 1; // C = 11, shift it over 11 bits
            if(present)notes.push(note);
        }
        return notes
    }
    const chordToScales = chord => {
        return Enumerator.scales().reduce((acc,scale)=>{
            if(NoteSet.contains(scale,chord)){
                acc.push(scale);
            }
            return acc;
        },[])
    }
    const contains = (scale,chord)=>{
        return (scale & chord) == chord;
    }
    const equals = (a,b) => {
        return contains(a,b) && contains(b,a);
    }
    return ({
        toNotes:setToNotes,
        fromNotes:fromNotes,
        fromRootAndIntervals:fromRootAndIntervals,
        contains:contains,
        chordToScales:chordToScales
    })
})()

const Tester = (()=>{
    const convertSetToNotesAndBack = () => {
        for(var set = 0; set < 4096; ++set){
            var notes = NoteSet.toNotes(set);
            var generatedSet = NoteSet.fromNotes(...notes);
            assert(set==generatedSet,"failed conversion from set to notes and back");
        }
    }
    const convertNotesToSetAndBack = () => {
        assert(Enumerator.noteTree().length==4096,"there should be 4096 note sets");
        Enumerator.noteTree().forEach(notes=>{
            var generatedSet = NoteSet.fromNotes(...notes);
            var generatedNotes = NoteSet.toNotes(generatedSet);
            assert(isEqualSet(generatedNotes,notes),"failed conversion from notes to set and back");
        })
    }
    const verifyExpectedValuesOfFromNotes = () => {
        assert(NoteSet.fromNotes(C,D,E,F,G,A,B) == 2048 + 512 + 128 + 32 + 16 + 4 + 1);
        assert(NoteSet.fromNotes(C,C,A,B)) == 2048 + 4 + 1;
    }
    const test = () => {
        convertSetToNotesAndBack();
        convertNotesToSetAndBack();
        verifyExpectedValuesOfFromNotes();
    }
    test();
    return ({
    })
})()

const Analyzer = (()=>{
    const guessKey = chords => {
        var keyPopularity = [];
        chords.forEach(chord=>{
            var keysFromChord = NoteSet.chordToScales(chord).forEach(scale=>{
                keyPopularity[scale] = keyPopularity[scale]? keyPopularity[scale]+1 : 1;
            });
        })
        var sortable = [];
        Object.keys(keyPopularity).forEach(set=>{
            sortable.push({set:set,hits:keyPopularity[set]})
            // console.log(Name.scale(set)," popularity: ",keyPopularity[set]);
        })
        sortable.sort((a,b)=>{
            if(a.hits<b.hits) return 1;
            if(a.hits>b.hits) return -1;
            return 0;
        })
        // console.log(sortable);
        return sortable[0].set;
    }
    const top3 = chords => {
        var keyPopularity = [];
        chords.forEach(chord=>{
            var keysFromChord = NoteSet.chordToScales(chord).forEach(scale=>{
                keyPopularity[scale] = keyPopularity[scale]? keyPopularity[scale]+1 : 1;
            });
        })
        var sortable = [];
        Object.keys(keyPopularity).forEach(set=>{
            sortable.push({set:set,hits:keyPopularity[set]})
            // console.log(Name.scale(set)," popularity: ",keyPopularity[set]);
        })
        sortable.sort((a,b)=>{
            if(a.hits<b.hits) return 1;
            if(a.hits>b.hits) return -1;
            return 0;
        })
        // console.log(sortable);
        return sortable.slice(0,3).map(el=>el.set);
    }
    const noteKeyChanges = chords => {
        chords.reduce((acc,curr)=>{
            var possibleScales = NoteSet.chordToScales(curr);
            var intersection =  intersect(acc,possibleScales);
            console.log("chord",Name.chord(curr),"keys",intersection.map(Name.scale));
            if(intersection.length < 1){
                // key change!
                console.log("key change!!!");
                return possibleScales;
            }
            else{
                return intersection;
            }
        },Enumerator.scales())
    }
    return ({
        guessKey:guessKey,
        top3:top3,
        noteKeyChanges:noteKeyChanges
    })
})();

const Songer = (()=>{
    const fromScaleDegrees = degrees =>{

    }
    return({

    })
})()

const Chord = (()=>{
    // convert chord name to intervals...
    const fromRootAndDegreeAndIntervals = (root,degree,intervals) =>{
        const rootOfThisChord = Note.plus(root+SCALE_DEGREE_SEMITONES[degree]);
        return NoteSet.fromRootAndIntervals(rootOfThisChord,intervals);
    }
    const fromRomanNumeral = (root,scale,str) => {
        //split into numeral part, optional modifier, optional 7
        var re = /([iv]+|[IV]+)([b#]?)(o?)(7?)/g;
        var majorRE = /[IV]+/g;
        var result = re.exec(str);
        const baseNumber = SCALE_DEGREE_SEMITONES[ROMAN_NUMERAL_VALUES[result[1]]]
        const flatOrSharpModifier = FLAT_SHARP_VALUES[result[2]];
        const isDiminished = result[3] == "o";
        const isSeven = result[4] == "7";
        const isMajor = result[1].search(majorRE) > -1;
        const newChordRoot = (root+baseNumber+flatOrSharpModifier)%NUM_NOTES;
        console.log(newChordRoot,baseNumber,flatOrSharpModifier,root)

        const intervals = [];
        if(isMajor){
            intervals[0]=4; //major third
            intervals[1]=3; //minor third
        }
        else{
            intervals[0]=3; //minor third
            if(isDiminished){
                intervals[1]=3; //minor third
            }
            else{
                intervals[1]=4; //major third
            }
        }
        if(isSeven){
            const intervalsWithFlat7 = intervals.slice();
            intervalsWithFlat7.push(3); //minor third
        
            const setWithFlat7 = NoteSet.fromRootAndIntervals(newChordRoot,intervalsWithFlat7);
            if(NoteSet.contains(scale,setWithFlat7)){
                // it's a flat 7.
                return setWithFlat7;
            }
            else{
                const intervalsWithMaj7 = intervals.slice();
                intervalsWithMaj7.push(4); // major third
                return NoteSet.fromRootAndIntervals(newChordRoot,intervalsWithMaj7);
            }
        }
        else{
            return NoteSet.fromRootAndIntervals(newChordRoot,intervals);
        }
    }

    return({
        fromRomanNumeral:fromRomanNumeral
    })
})()

const Frequencies = (()=>{
    const fromChord = chord => {
        // get individual notes
        const notes = NoteSet.toNotes(chord);
        const frequencies = notes.map(note=>JUST_FREQUENCIES[note]);
        return frequencies;
    }
    const getBeating = frequencies => {
        const beats = [];
        frequencies.forEach(freqA=>{
            frequencies.forEach(freqB=>{
                if(freqA != freqB){
                    const beat = Math.abs(freqA-freqB);
                    beats.push(beat); 
                }
            })
        })
        return beats;
    }
    const addBeatings = frequencies => {
        return frequencies.concat(getBeating(frequencies));
    }
    return ({
        fromChord:fromChord,
        addBeatings:addBeatings
    })
})()

// console.log(Name.chord(Chord.fromRomanNumeral(C, NoteSet.fromRootAndIntervals(C,SCALE_INTERVALS.MAJOR), "v7")));

// const progression = "IV7 I iii III7";
// const progkey = C;
// const progscale = NoteSet.fromRootAndIntervals(C,SCALE_INTERVALS.MAJOR);
// const romans = progression.split(" ").filter(str=>str.length>0);
// romans.forEach(roman=>{
//     console.log(Name.chord(Chord.fromRomanNumeral(progkey,progscale,roman)));
// })



// what are the notes in the following progression
// key of C
// IV7    I iii III^b7
// FMaj7  C Em   E7 

// key of A harmonic minor
// VI7  III  v   V7

// minor:
// i iio III iv v VI VII
// x o x o x x o x o x o x x major 7s: Maj, Min, Min, Maj, Dom, Min, Half
// x o x x o x o x x o x o x minor 7s: Min, Half,Maj,Min,Min,Maj, Dom
// x o x x o x o x x o o x x harmonic minor 7s: minmaj, flat?,maj,flat,flat,maj,dim
// harmonic minor:
// i iio III iv V VI viio

// IMaj7



// const chord = NoteSet.fromNotes;
const Scale = NoteSet.fromNotes;
const chord = NoteSet.fromRootAndIntervals;



const chords = [];
const fMaj7 = chord(F,CHORD.MAJ7);
const CM = chord(C,CHORD.MAJOR);
const Em = chord(E,CHORD.MINOR);
const E7 = chord(E,CHORD.DOM7);
const Am = chord(A,CHORD.MINOR);
const GM = chord(G,CHORD.MAJOR);
const FM = chord(F,CHORD.MAJOR);
const Bdim = chord(B,CHORD.DIMINISHED);
const DM = chord(D,CHORD.MAJOR);
const EbM = chord(Eb,CHORD.MAJOR);
const BbM = chord(Bb,CHORD.MAJOR);
const GsM = chord(Gs,CHORD.MAJOR);
const Dm = chord(D,CHORD.MINOR);
const verseLine = [fMaj7,CM,Em,Em];
const bridgeLine = [fMaj7,CM,E7,E7];
const verse = [...verseLine,...verseLine,...verseLine,...bridgeLine];
const leadup = [Am,Em,GM,GM,Am,Em,FM,FM];
const chorus = [CM,CM,E7,E7,fMaj7,fMaj7,Bdim,Bdim,CM,CM,E7,E7,fMaj7,fMaj7,Bdim,Bdim]
const song = [...verse,...leadup,...chorus,...verse,...leadup,...chorus]
const viswasNotes = [D,Ds,D,Ds,D,Ds,D,C,A,C,G,A,C,A,C,D,Ds,Ds,Ds,D,C];
const viswaschords = viswasNotes.map(note=>NoteSet.fromNotes(note));

const Shiny = (()=>{
    const verse = [Em,Am,Em,Am,Em,Am,CM,DM]
    const chorus = [GM,CM,GM,CM,DM,GM,CM,Am,DM,  Em,CM,Em,CM,DM,  Em,CM,Am,DM];
    const tension = [EbM,EbM];
    const bridge = [EbM, BbM,EbM,BbM,EbM,BbM,EbM,BbM,CM,Dm,EbM,FM,BbM,GsM]

    const song = [...verse,...verse,...chorus,...tension,...verse,...verse,...chorus,...bridge,...chorus]
    return({
        chords:song
    })
})();


// Analyzer.noteKeyChanges(Shiny.chords);


// (()=>{
//     var DM = chord(D,CHORD.MAJOR);
//     var scale = NoteSet.fromRootAndIntervals(C,SCALE_INTERVALS.MAJOR);
//     const toRomanNumeral = (chord,root,scale) => {
//     }
// })
// {
//     const compare = (a,b) => {
//         if(a<b) return -1;
//         if(a>b) return 1;
//         return 0;
//     }
//     const average = arr => {
//         const sum = arr.reduce((acc,curr)=>acc+curr);
//         return sum/arr.length;
//     }
//     Shiny.chords.map(chord=>{
//         const freqs = Frequencies.fromChord(chord);
//         const withbeats = Frequencies.addBeatings(freqs)
//         const withmorebeats = Frequencies.addBeatings(withbeats);
//         const avg = average(withbeats);
//         console.log(Name.chord(chord),avg); 
//     });

// }


// 200, 300, beating: 100
// 200, 250, 300 beating: 50,100 Major third
// 200, 240, 300 beating: 40, 60, 100
//
// I want to take in a scale(set of notes, root) and a chord and determine the roman numeral that it should be
// so key of C, chord of DM would be II
// C   D   E F   G   A   B C
// 1 x 2 x 3 4 x 5 x 6 x 7 8
// o   o   o o   o   o   o o
//     o     o       o

// D Minor: II
// F 


/* Math */
