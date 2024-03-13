// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

struct TaskInQueue {
    uint256 id;
    uint taskType;
    address creator;
    bytes32 taskHash;
    bytes32 dataHash;
    uint vramLimit;
    uint taskFee;
    uint price;
}

struct TaskMaxHeap {
    // tasks index starts from 1
    TaskInQueue[] tasks;
    // mapping task id to task position in heap
    mapping(uint => uint) positions;
}

library TaskMaxHeap_impl {
    function insert(TaskMaxHeap storage heap, TaskInQueue memory task) internal {
        if (heap.tasks.length == 0) {
            TaskInQueue memory empty;
            heap.tasks.push(empty);
        }
        heap.tasks.push(task);
        uint index = heap.tasks.length - 1;
        for (; index > 1 && task.price > heap.tasks[index / 2].price; index = index / 2) {
            heap.tasks[index] = heap.tasks[index / 2];
            uint id = heap.tasks[index].id;
            heap.positions[id] = index;
        }
        heap.tasks[index] = task;
        heap.positions[task.id] = index;
    }

    function include(TaskMaxHeap storage heap, uint taskId) internal view returns (bool) {
        uint index = heap.positions[taskId];
        return index > 0;
    }

    function size(TaskMaxHeap storage heap) internal view returns (uint) {
        if (heap.tasks.length == 0) {
            return 0;
        }
        return heap.tasks.length - 1;
    }

    function top(TaskMaxHeap storage heap) internal view returns (TaskInQueue memory) {
        require(heap.tasks.length > 1, "Heap is empty");
        return heap.tasks[1];
    }

    function get(TaskMaxHeap storage heap, uint taskId) internal view returns (TaskInQueue memory) {
        uint index = heap.positions[taskId];
        require(index > 0, "Task not in heap");
        return heap.tasks[index];
    }

    function _removeAt(TaskMaxHeap storage heap, uint index) internal returns (TaskInQueue memory) {
        TaskInQueue memory current = heap.tasks[index];
        TaskInQueue memory last = heap.tasks[heap.tasks.length - 1];

        if (last.price < current.price) {
            while (2 * index < heap.tasks.length) {
                uint nextIndex = 2 * index;
                if (nextIndex + 1 < heap.tasks.length && heap.tasks[nextIndex + 1].price > heap.tasks[nextIndex].price) {
                    nextIndex++;
                }
                if (last.price >= heap.tasks[nextIndex].price) {
                    break;
                }
                heap.tasks[index] = heap.tasks[nextIndex];
                uint id = heap.tasks[index].id;
                heap.positions[id] = index;
                index = nextIndex;
            }
        } else if (last.price > current.price) {
            for (; index > 1 && last.price > heap.tasks[index / 2].price; index = index / 2) {
                heap.tasks[index] = heap.tasks[index / 2];
                uint id = heap.tasks[index].id;
                heap.positions[id] = index;
            }
        }
        heap.tasks[index] = last;
        heap.positions[last.id] = index;
        heap.tasks.pop();

        delete heap.positions[current.id];
        return current;
    }

    function pop(TaskMaxHeap storage heap) internal returns (TaskInQueue memory) {
        require(heap.tasks.length > 1, "Heap is empty");
        return _removeAt(heap, 1);
    }

    function remove(TaskMaxHeap storage heap, uint taskId) internal returns (TaskInQueue memory) {
        uint index = heap.positions[taskId];
        require(index > 0, "Task is not in heap");

        return _removeAt(heap, index);
    }
}

struct TaskMinHeap {
    // tasks index starts from 1
    TaskInQueue[] tasks;
    // mapping task id to task position in heap
    mapping(uint => uint) positions;
}

library TaskMinHeap_impl {
    function insert(TaskMinHeap storage heap, TaskInQueue memory task) internal {
        if (heap.tasks.length == 0) {
            TaskInQueue memory empty;
            heap.tasks.push(empty);
        }
        heap.tasks.push(task);
        uint index = heap.tasks.length - 1;
        for (; index > 1 && task.price < heap.tasks[index / 2].price; index = index / 2) {
            heap.tasks[index] = heap.tasks[index / 2];
            uint id = heap.tasks[index].id;
            heap.positions[id] = index;
        }
        heap.tasks[index] = task;
        heap.positions[task.id] = index;
    }

    function include(TaskMinHeap storage heap, uint taskId) internal view returns (bool) {
        uint index = heap.positions[taskId];
        return index > 0;
    }

    function size(TaskMinHeap storage heap) internal view returns (uint) {
        if (heap.tasks.length == 0) {
            return 0;
        }
        return heap.tasks.length - 1;
    }

    function top(TaskMinHeap storage heap) internal view returns (TaskInQueue memory) {
        require(heap.tasks.length > 1, "Heap is empty");
        return heap.tasks[1];
    }

    function get(TaskMinHeap storage heap, uint taskId) internal view returns (TaskInQueue memory) {
        uint index = heap.positions[taskId];
        require(index > 0, "Task not in heap");
        return heap.tasks[index];
    }

    function _removeAt(TaskMinHeap storage heap, uint index) internal returns (TaskInQueue memory) {
        TaskInQueue memory current = heap.tasks[index];
        TaskInQueue memory last = heap.tasks[heap.tasks.length - 1];

        if (last.price > current.price) {
            while (2 * index < heap.tasks.length) {
                uint nextIndex = 2 * index;
                if (nextIndex + 1 < heap.tasks.length && heap.tasks[nextIndex + 1].price < heap.tasks[nextIndex].price) {
                    nextIndex++;
                }
                if (last.price <= heap.tasks[nextIndex].price) {
                    break;
                }
                heap.tasks[index] = heap.tasks[nextIndex];
                uint id = heap.tasks[index].id;
                heap.positions[id] = index;
                index = nextIndex;
            }
        } else if (last.price < current.price) {
            for (; index > 1 && last.price < heap.tasks[index / 2].price; index = index / 2) {
                heap.tasks[index] = heap.tasks[index / 2];
                uint id = heap.tasks[index].id;
                heap.positions[id] = index;
            }
        }
        heap.tasks[index] = last;
        heap.positions[last.id] = index;
        heap.tasks.pop();

        delete heap.positions[current.id];
        return current;
    }

    function pop(TaskMinHeap storage heap) internal returns (TaskInQueue memory) {
        require(heap.tasks.length > 1, "Heap is empty");
        return _removeAt(heap, 1);
    }

    function remove(TaskMinHeap storage heap, uint taskId) internal returns (TaskInQueue memory) {
        uint index = heap.positions[taskId];
        require(index > 0, "Task is not in heap");

        return _removeAt(heap, index);
    }
}
