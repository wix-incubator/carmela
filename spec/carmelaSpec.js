const carmela = require('../carmela.js')
global._ = require('lodash')
const _root = require('./todos-data.js')

root = $(_root)
const len = obj => _.isArray(obj) ? obj.length : Object.keys(obj).length

describe('Carmela', () => {
  it('basic', () => {
    expect($(1).$).toEqual(1)
  })
  it('root', () => {
    expect(len(root.$)).toBe(3)
  })
  it('get', () => {
    const todos = root.get('todos')
    const doneTodos = todos.filterBy(val => val.get('done'));
    expect(len(todos.$)).toBe(6)
    expect(len(doneTodos.$)).toBe(3)
  })
  it('not', () => {
    const todos = root.get('todos')
    const pendingTodos = todos.filterBy(val => val.get('done').not());
    expect(len(pendingTodos.$)).toBe(3)
  })
});
