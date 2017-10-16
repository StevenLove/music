const NOTES = [0,1,2,3,4,5,6,7,8,9,10,11].map(val=>{
    return {
        value:val
    }
})

const NotePrototype = (()=>{
    const validRoots = [C,D,E,F,G,A,B];
    const validModifiers = [SHARP,FLAT,NO_MODIFIER];
    const validOctaves = OCTAVES.slice().push(OCTAVE_UNSPECIFIED);

    const validateRoot = root =>{
        assertIn(root,validRoots);
    }
    const validateModifier = modifier =>{
        assertIn(modifier,validModifiers);
    }
    const validateOctave = octave => {
        assertIn(octave,validOctaves);
    }
    const validateNoCFlatNegative2 = (root,modifier,octave) => {
        if(octave == -2 && modifier == 'b' && root == 'C') throw "C flat negative 2 is not a valid note";
    }

    const validate = (root,modifier,octave) => {
        validateRoot(root);
        validateModifier(modifier);
        validateOctave(octave);
        validateNoCFlatNegative2(root,modifier,octave);
    }

    const getValue = (root,modifier) => {
        return (root.value + modifier.value) % NUM_NOTES;
    }

    // I am assuming that a B#4 is not enharmonic to a C4
    // and that it is instead one octave above C4
    const getID = (root,modifier,octave) => {
        return (octave-MIN_OCTAVE)*NUM_NOTES + getValue(root,modifier);
    }

    return ({
        // getID:getID,
        getValue:getValue,
        validate:validate
    }) 

})();

const getNote = value => {
    return NOTES[value];
}
// Do I want to instead treat notes like just their ID
// kind of like how binary data is treated in assembly
// and determine if it's a B# vs C or Eb vs D# by the context of the operation?
// yes
const Note = value => {
    // assert its between 0 and 11
    const plus = interval => {
        const newValue = (value + interval.value) % NUM_NOTES;
        return getNote(newValue);
    }
    return {
        value:value,
        plus:plus
    }
}

const Interval = value => {
    return{
        value:value
    }
}