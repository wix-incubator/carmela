const {and, or, root, arg0, setter} = require('carmi');
const todos = root.get('todos');
const doneTasks = todos.filterBy(val => val.get('done'))
const pendingTodos = todos.filterBy(val => val.get('done').not())

module.exports =  {
  todos,
  doneTasks,
  pendingTodos
};
