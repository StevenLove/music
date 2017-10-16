
const MAJOR_SCALE = [
    0,200,400,500,700,900,1100,1200
]


const createBulge = () => {
    var bulge = spectrum();
    var halfwidth = 100;
    for(var i = -halfwidth; i < halfwidth; ++i){
        var dist = (halfwidth-Math.abs(i))/halfwidth;
        var amt;
            amt = Math.pow(dist,4);
            // amt = dist
        bulge.set(i,amt)
    }
    return bulge;
}

const createHarmonicSeries = () => {
    var iterations = 16;

    var harmonicSeries = spectrum();
    for(var i = 1; i <= iterations; ++ i){
        var c = Converter.harmonicSeriesToCentsAboveRoot(i);
        var thisBulge = createBulge().shiftUp(c);
        // thisBulge.scale(1/i);
        harmonicSeries = harmonicSeries.add(thisBulge);
    }
    return harmonicSeries;
}
const createTone = cents => {
    return createHarmonicSeries().shiftUp(cents);
}
const createChord = centsArr => {
    var chord = spectrum();
    centsArr.forEach(cents=>{
        chord = chord.add(createTone(cents));
    })
    return chord;
}

const plotGraphs = () => {
    var hSeries = createHarmonicSeries();
    hSeries.plot("a","harmonic series");

    var chord = createChord([0,400,700]);
    chord.plot("b","Major chord");

    var combo = chord.times(hSeries);
    combo.plot("c","added");

    var chord_possibilities = spectrum();
    for(var i = 0; i < 1200; ++i){
        var amp = hSeries.times(chord.shiftUp(i)).totalAmplitude();
        chord_possibilities.set(i,amp);
    }
    chord_possibilities.plot("d","likely roots");
}

/* The first spectrum stays still
   The second spectrum is shifted across all values.
   For each amount of shifting, we measure the total area under the combined spectra */
const combinedAmplitudes = (s1,s2) => {
    const result = spectrum();
    for(var i = 0 ; i < 1200; ++i){
        result.set(i,s1.times(s2.shiftUp(i)).totalAmplitude());
    }
    return result;
}
const scaleDegreeToChord = degree => {
    if(degree < 1 || degree > 7){
        console.error("only scale degrees 1-7");
        return;
    }
    const root = majorScaleDegreeToCents(degree);
    var chord;
    switch(degree){
        case 1: case 4: case 5:
            chord = createMajorChord(root);break;
        case 2: case 3: case 6:
            chord = createMinorChord(root);break;
        case 7:
            chord = createDiminishedChord(root);break;
    }
    return chord;  
}
const scaleDegreeToCents = (scale,degree) => {
    return scale[degree-1];
}
const majorScaleDegreeToCents = degree => {
    if(degree < 1 || degree > 7){
        console.error("only scale degrees 1-7");
        return;
    }
    return MAJOR_SCALE[degree-1];
}
const createMajorChord = root => {
    return createChord([root,root+400,root+700]);
}
const createMinorChord = root => {
    return createChord([root,root+300,root+700]);
}
const createDiminishedChord = root => {
    return createChord([root,root+300,root+600]);
}

const plotD3Graphs = () => {
    var chord = createChord([0,300,700]);
    var shiftedChord;
    const hSeries = createHarmonicSeries();
    /*
    var p1 = d3plotter(hSeries);
    var p2 = d3plotter(chord);
    var p3 = d3plotter(hSeries.times(chord));
    var p4 = d3plotter(combinedAmplitudes(hSeries,chord));
    */

    
    /*
    var progression = [1,4,5].map(sd=>scaleDegreeToChord(sd));
    var progression = spectrum();
    [1,4,5].forEach(sd=>{
        var chord = scaleDegreeToChord(sd);
        d3plotter(chord);
        progression = progression.add(chord);
    })
    d3plotter(progression);
    d3plotter(combinedAmplitudes(hSeries,progression));
    */
    // var fourth = createChord([0,500]);
    var root = createTone(0);
    var fourth = createTone(500);
    d3plotter(root);
    d3plotter(fourth);
    
    d3plotter(combinedAmplitudes(fourth,hSeries));
    

    const enableSlider = () => {
        const onSlide = () => {
            const newValue = $("#slider").val();
            shiftedChord = chord.shiftUp(newValue);
            p2.update(shiftedChord);
            p3.update(hSeries.times(shiftedChord));
        }
        $("#slider").on("input",onSlide);
    }

    enableSlider();
}
