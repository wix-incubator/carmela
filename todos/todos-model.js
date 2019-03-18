const countItems = 6;
const random = i => Math.floor(Math.random() * i)
function randomTodoItem(idx) {
  return {
    text: `todo_${idx}`,
    done: random(2) === 0,
    blockedBy: random(4) === 2 ? `${(idx + random(countItems - 1)) % countItems}` : false
  };
}

function generateTestTodoItems(count) {
  const res = {};
  for (let idx = 0; idx < count; idx++) {
    res[`${idx}`] = randomTodoItem(idx);
  }
  return res;
}
const todos_state = {
  todos: generateTestTodoItems(countItems),
  currentTask: '1',
  showCompleted: false
};

const todos_model = model(todos_state)
