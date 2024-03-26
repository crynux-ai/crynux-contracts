// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "../TaskHeap.sol";

contract TestTaskHeap {
    using TaskMaxHeap_impl for TaskMaxHeap;
    using TaskMinHeap_impl for TaskMinHeap;

    TaskMaxHeap private maxHeap;
    TaskMinHeap private minHeap;
    TaskInQueue[] public removeTaskRes;

    function getMaxHeapTask() public view returns (TaskInQueue[] memory) {
        return maxHeap.tasks;
    }

    function maxHeapInclude(uint taskId) public view returns (bool) {
        return maxHeap.include(taskId);
    }

    function maxHeapGet(uint taskId) public view returns (TaskInQueue memory) {
        return maxHeap.get(taskId);
    }

    function maxHeapTop() public view returns (TaskInQueue memory) {
        return maxHeap.top();
    }

    function maxHeapPop() public {
        maxHeap.pop();
    }

    function getMinHeapTask() public view returns (TaskInQueue[] memory) {
        return minHeap.tasks;
    }

    function minHeapInclude(uint taskId) public view returns (bool) {
        return minHeap.include(taskId);
    }

    function minHeapGet(uint taskId) public view returns (TaskInQueue memory) {
        return minHeap.get(taskId);
    }

    function minHeapTop() public view returns (TaskInQueue memory) {
        return minHeap.top();
    }

    function minHeapPop() public {
        minHeap.pop();
    }

    function testMaxHeapInsert() public {
        for (uint i = 0; i < 6; i++) {
            TaskInQueue memory task = TaskInQueue({
                id: i + 1,
                taskType: 0,
                creator: address(0),
                taskHash: bytes32(uint(1)),
                dataHash: bytes32(uint(2)),
                vramLimit: 0,
                taskFee: 100 * (i + 1),
                price: 100 * (i + 1)
            });

            maxHeap.insert(task);
        }
    }

    function testMaxHeapRemove(uint idx) public {
        removeTaskRes.push(maxHeap.remove(idx));
    }

    function testMinHeapInsert() public {
        for (uint i = 0; i < 6; i++) {
            TaskInQueue memory task = TaskInQueue({
                id: i + 1,
                taskType: 0,
                creator: address(0),
                taskHash: bytes32(uint(1)),
                dataHash: bytes32(uint(2)),
                vramLimit: 0,
                taskFee: 100 * (6 - i),
                price: 100 * (6 - i)
            });

            minHeap.insert(task);
        }
    }

    function testMinHeapRemove(uint idx) public {
        removeTaskRes.push(minHeap.remove(idx));
    }
}
