function applyValue(data) {
    return data && typeof data.value === 'function' ? data.value() : data
}

function wrapLodashVal(f,data) {
    return p1 => $(f(data,p1))
}

function wrapLodashFunc(f, innerFunc, data) { // e.g. filter
    return $(f(_.mapValues(data,$), val => innerFunc(val).$ ))
}

function wrapData(_data) {
    if (_data.wrapped) return _data;
    const data = applyValue(_data)
    return {
        $wrapped: true,
        $: !data ? data : _.isArray(data) ? _.map(data, x => x && x.$$data ? x.$$data : x) : _.isPlainObject(data) ? _.mapValues(data, x => x && x.$$data ? x.$$data : x) : data,
        $$data: data,
        filterBy: _.isArray(data) ? f => wrapLodashFunc(_.pickBy,f,data) : f => wrapLodashFunc(_.filter,f,data),
        mapValues: _.isArray(data) ? f => wrapLodashFunc(_.map,f,data) : f => wrapLodashFunc(_.mapValues,f,data),
        get: wrapLodashVal(_.get,data),
        not: wrapLodashVal(x=>!x,data),
        eq: wrapLodashVal(_.isEqual,data)
    }
}

const or = (data1,data2) => data1.$ || data2.$
const and = (data1,data2) => data1.$ && data2.$

$ = wrapData

//todos.filterBy(val => val.get('done').not());

//module.exports =  {$}
  