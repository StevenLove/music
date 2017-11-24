var teoria = require("teoria");

const Converter = (()=>{
    const SCALE_DEGREE_NAMES = {
        0:"root",
        1:"minor 2nd",
        2:"major 2nd",
        3:"minor 3rd",
        4:"major 3rd",
        5:"perfect 4th",
        6:"tritone",
        7:"perfect 5th",
        8:"minor 6th",
        9:"major 6th",
        10:"minor 7th",
        11:"major 7th",
        12:"octave"
    }

    const intervalToName = semitones => {
        if(semitones < 0 || semitones > 12){
            console.error("too many intervals");
            return "unnamed";
        }
        return SCALE_DEGREE_NAMES[semitones];
    }

    const centsToName = cents => {
        var rounded = 100*z.round(cents/100);
        var name = SCALE_DEGREE_NAMES[rounded/100];
        var modifier = (cents >= rounded)? "+" : "-";
        var diff = MATH.abs(cents-rounded).toFixed(0);
        return name+" ("+modifier+diff+")"
    }
    
    // should be between 1 and 2
    const fractionToCents = fraction => {
        if(fraction < 1 || fraction > 2){
            throw "fraction should be between 1 and 2";
        }
        const val = Math.log2(fraction)*1200;
        // console.log("fraction",fraction,"goes to",val);
        return val;
    }
    const centsToFraction = cents => {
        // ratio=10.^((log10(2)/1200)*cents);
        const val = Math.pow(10,(Math.log10(2)/1200)*cents);
        console.log("cents to fraction",cents,val);
        return val;
    }

    const normalizeBetweenOneAndTwo = number => {
        if(number <= 0){
            console.error("number should be positive");
            return;
        }
        while(number >= 2){
            number /= 2;
        }
        while(number < 1){
            number *= 2;
        }
        return number;
    }

    const isInteger = n => n == Math.round(n);
    const harmonicSeriesToCentsAboveRoot = seriesNumber => {
        if(!isInteger(seriesNumber) || seriesNumber < 1){
            console.error("incorrect input to harmonic series to cents above root function");
            return;
        }
        // divide by 2 until its between one and two
        const fraction = normalizeBetweenOneAndTwo(seriesNumber);
        // console.log("fraction",fraction);
        return fractionToCents(fraction);

    }
    
    const frequencyToCents = (root,target) => {
        const fraction = target / root;
        return fractionToCents(fraction);
    }

    const differenceInCents = (note1, note2) => {
        const f1 = note1.freq();
        const f2 = note2.freq();
        const ratio = f1/f2;
        var multiplier = 1;
        if(ratio < 1){
            ratio = 1/ratio;
            multiplier = -1;
        }
        const octaves = Math.floor(Math.log2(ratio));
        const remainder = ratio-Math.pow(octaves,2);
        const cents = 1200 * octaves + fractionToCents(ratio);
        return multiplier * cents;
    }

    const withinJND = (note1, note2) => {
        return Math.abs(differenceInCents(note1,note2)) < Constants.JNDCents;
    }
    const withinJNDCrossOctave = (note1, note2) => {
        const absDiff = Math.abs(differenceInCents(note1,note2));
        const diffWithoutOctave = absDiff % 1200;
        return diffWithoutOctave < Constants.JNDCents;
    }
    const intervalToIntervalClass = interval => {
        const input = interval.toString();
        interval = interval.simple();
        while(interval.smaller(teoria.interval('P1'))){
            interval = interval.add(teoria.interval('P8'));
        }
        const intervalClass = interval.semitones();
        console.log(input,"is interval class",intervalClass);
        return intervalClass;
    }

    const semitonesToSimpleName = semitones => {
        const names = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7']
        return names[semitones];    
    }
    const simpleNameToSemitones = scaleDegreeName => {
        const names = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7']
        const index = names.indexOf(scaleDegreeName);
        if(index < 0){
            throw "scale degree with bad name " + scaleDegreeName;
        }
        return index;
    }

    // Untested
    const simpleNoteNameToSemitonesFromC = simpleNoteName => {
        const sharpNames = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b']
        const flatNames =  ['c','db','d','eb','e','f','gb','g','ab','a','bb','b']
        const sharpIndex = sharpNames.indexOf(simpleNoteName);
        const flatIndex = flatNames.indexOf(simpleNoteName);
        const index = Math.max(sharpIndex,flatIndex);
        return index;
    }
    

    const incrementIntervalClass = semitones => {
        return (semitones + 1) % 12;
    }

    /*
    const harmonicFromRoot = (root, note) => {
        const f1 = root.freq();
        const f2 = note.freq();
        for(var i = 1; i < 30; ++i){
            var f = i * f1;
            
        }
    }
    */
    const frequencyToName = f => {
        const obj = teoria.note.fromFrequency(f);
        const offset = Math.round(obj.cents);
        var suffix = "";
        if(offset != 0){
            suffix = " ("+offset+")";
        }
        return obj.note.toString() + suffix;
    }

    const myMod = (v,modulo) => {
        while(v<0){
            v+=modulo;
        }
        return v%modulo;
    }

    return ({
        intervalToName:intervalToName,
        centsToName:centsToName,
        centsToFraction:centsToFraction,
        fractionToCents:fractionToCents,
        frequencyToCents:frequencyToCents,
        normalizeBetweenOneAndTwo:normalizeBetweenOneAndTwo,
        intervalToIntervalClass:intervalToIntervalClass,
        simpleNameToSemitones:simpleNameToSemitones,
        semitonesToSimpleName:semitonesToSimpleName,
        incrementIntervalClass:incrementIntervalClass,
        harmonicSeriesToCentsAboveRoot:harmonicSeriesToCentsAboveRoot,
        frequencyToName:frequencyToName,
        myMod:myMod
        // harmonicFromRoot:harmonicFromRoot
    })
})()

module.exports = Converter;