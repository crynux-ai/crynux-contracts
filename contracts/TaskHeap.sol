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

struct TaskHeap {
    TaskInQueue[] tasks;
}

library TaskHeap_impl {
    function insert(TaskHeap storage heap, TaskInQueue memory task) internal {
        heap.tasks.push(task);
        uint index = heap.tasks.length - 1;
        for (; index > 0 && task.price > heap.tasks[(index - 1) / 2].price; index = (index - 1) / 2) {
            heap.tasks[index] = heap.tasks[(index - 1) / 2];
        }
        heap.tasks[index] = task;
    }

    function size(TaskHeap storage heap) internal view returns (uint) {
        return heap.tasks.length;
    }

    function top(TaskHeap storage heap) internal view returns (TaskInQueue memory) {
        return heap.tasks[0];
    }

    function pop(TaskHeap storage heap) internal {
        TaskInQueue memory last = heap.tasks[heap.tasks.length - 1];

        uint index = 0;
        while (2 * index + 1 < heap.tasks.length) {
            uint nextIndex = 2 * index + 1;
            if (nextIndex + 1 < heap.tasks.length && heap.tasks[nextIndex + 1].price > heap.tasks[nextIndex].price) {
                nextIndex++;
            }
            if (last.price >= heap.tasks[nextIndex].price) {
                break;
            }
            heap.tasks[index] = heap.tasks[nextIndex];
            index = nextIndex;
        }
        heap.tasks[index] = last;
        heap.tasks.pop();
    }
}