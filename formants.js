


const Formants = (()=>{
    
    

    const peaksForVowelSound = v => {
        const vowels = {
            oo:[300,870,2240],
            ow:[570,840,2410],
            u:[440,1020,2240],
            a:[730,1090,2440],            
            uh:[520,1190,2390],
            er:[490,1350,1690],
            ae:[660,1720,2410],
            e:[530,1840,2480],
            i:[390,1990,2550],
            iy:[270,2290,3010],
            m:[200,2200,3600]
        }
        return vowels[v];
        
    }

    return ({
        peaksForVowelSound:peaksForVowelSound
    })
})()

module.exports = Formants;