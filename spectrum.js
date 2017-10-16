

const spectrum = (()=>{
    const xs = new Array(1200).fill(0).map((x,index)=>index);
    const create = () => {
        var ys = new Array(1200).fill(0);

        const set = (freq,amp)=>{
            while(freq < 1200){
                freq += 1200;
            }
            ys[freq%1200] = amp;
        }
        const setAll = newYs => ys = newYs;

        const get = freq => {
            while(freq < 1200){
                freq += 1200;
            }
            return ys[freq%1200];
        }
        const getAll = () => ys;

        const shiftUp = cents => {
            if(cents < 0 ){
                console.error("dont shift up by a negative number!");
                return this;
            }
            while(cents >= 1200){
                cents -= 1200;
            }
            // shiftUp by 2
            //[a,b,c,d,e]
            //[d,e,a,b,c]
            result = create();
            result.setAll(ys.slice(1200-cents).concat(ys.slice(0,1200-cents)));
            return result;
        }
        const add = spectrum => {
            result = create();
            for(var i = 0; i < 1200; ++i){
                result.set(i,get(i)+spectrum.get(i))
            }
            return result;
        }
        const plotMe = (elementID,title) => {
            plot(elementID,xs,ys,title,"frequency","amplitude");
        }
        const totalAmplitude = () => {
            return ys.reduce((acc,curr)=>acc+curr,0);
        }
        const scale = factor => {
            for(var i = 0; i < 1200; ++i){
                ys[i] = ys[i]*factor;
            }
        }
        const times = spectrum => {
            var result = create();
            for(var i = 0; i < 1200; ++i){
                result.set(i,ys[i]*spectrum.get(i));
            }
            return result;
        }
        const and = spectrum => {
            var result = create();
            for(var i = 0; i < 1200; ++i){
                result.set(i,Math.min(ys[i],spectrum.get(i)));
            }
            return result;
        }
        return {
            set:set,
            setAll:setAll,
            get:get,
            getAll:getAll,
            shiftUp:shiftUp,
            add:add,
            plot:plotMe,
            totalAmplitude:totalAmplitude,
            scale:scale,
            times:times,
            and:and
        }
    }
    return create;
})();





