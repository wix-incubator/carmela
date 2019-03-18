# carmela
carmi interpreter

## Introduction
Carmela is a tiny interpreter for carmi implemented with lodash.
It can be used for rapid development and debug of carmi expressions

## Getting Started. Todos sample:
1. git clone git@github.com:wix-private/carmela.git, cd carmela, yarn && yarn build
2. open chrome with `open ./carmela-todos.html` or `file:///MY_PROJECT_DIR/carmela/carmela-todos.html`
3. open chrome debugger
4. goto console
5. change to inner iframe (change the picklist from 'top' to 'about:blank' )
6. write `pendingTodos = todos.filterBy(val => val.get('done').not()).$` and see the results
7. write `doneTasks = todos.filterBy(val => val.get('done')).$` and see the results
8. goto todos/todosCarmi.js and add the line `const doneTasks = todos.filterBy(val => val.get('done'))` also add 'doneTasks' to hte exports
9. recompile carmi with doneTasks - yarn build:todos
10. refresh the browser and add more carmi expressions based on doneTasks

## How does it work?

Carmela tries to 'simulate' carmi. 
- Carmela has its own frame and uses the globals in the frame to simulate carmi 'environemnt' as interpreter. e.g., root, and, or
- Carmela copies all values in the carmi instance, so you can use it in building new expressions

In order to run your expression carmela wraps and unwrap your data.
- wrapping is done with the `wrapData` function
- unwrapping is done with the `$` property of the wrapped object

Here is the core code:
~~~~
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
        $: !data ? data : _.isArray(data) ? _.map(data, x => x && x.$$data ? x.$$data : x) : _.isObject(data) ? _.mapValues(data, x => x && x.$$data ? x.$$data : x) : data,
        $$data: data,
        filterBy: _.isArray(data) ? f => wrapLodashFunc(_.pickBy,f,data) : f => wrapLodashFunc(_.filter,f,data),
        mapValues: _.isArray(data) ? f => wrapLodashFunc(_.map,f,data) : f => wrapLodashFunc(_.mapValues,f,data),
        get: wrapLodashVal(_.get,data),
        not: wrapLodashVal(x=>!x,data),
        eq: wrapLodashVal(_.isEqual,data)
    }
}
~~~~

## Contributing
Contribution is more than welcomed.