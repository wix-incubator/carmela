const carmela_init = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.11/lodash.js"></script>
<script src="./carmela.js"></script>`

var carmela = {
     init(carmiInstance) {
        return new Promise(resolve=>{
            this.instance = carmiInstance
            const iframe = this.iframe = document.createElement("iframe");
            // iframe.src = '/carmela/iframe.html';
            iframe.onload = function() {
                carmela.win = iframe.contentWindow
                carmela.win.carmela = carmela
                carmela.win.document.write(carmela_init)
                waitFor(()=>carmela.win.$).then(()=>{
                    carmela.$ = carmela.win.$
                    carmela.win.carmiInstance = carmiInstance
                    carmela.vals = _.pickBy(carmiInstance, (obj,key) => obj.constructor.name === 'Object')
                    Object.assign(carmela.win, _.mapValues(carmela.vals,carmela.$))
                    carmela.win.root = carmiInstance.$model
                    resolve()
                })
            };
            document.body.appendChild(iframe);
        })
    }
}

function waitFor(waitFunc) {
    return new Promise(resolve=>{
        const interval = setInterval(() => {
            if (waitFunc()) {
                clearInterval(interval)
                resolve()
            }
        }, 10);
    })
}
window.carmela = carmela;