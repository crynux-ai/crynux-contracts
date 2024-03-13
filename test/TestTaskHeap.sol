// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "truffle/Assert.sol";
import "../contracts/TaskHeap.sol";

contract TestTaskHeap {
    using TaskMaxHeap_impl for TaskMaxHeap;
    using TaskMinHeap_impl for TaskMinHeap;

    TaskMaxHeap private maxHeap;
    TaskMinHeap private minHeap;

    function testMaxHeap() public {
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

        Assert.equal(maxHeap.tasks[1].id, 6, "Wrong order in heap 1");
        Assert.equal(maxHeap.tasks[2].id, 4, "Wrong order in heap 2");
        Assert.equal(maxHeap.tasks[3].id, 5, "Wrong order in heap 3");
        Assert.equal(maxHeap.tasks[4].id, 1, "Wrong order in heap 4");
        Assert.equal(maxHeap.tasks[5].id, 3, "Wrong order in heap 5");
        Assert.equal(maxHeap.tasks[6].id, 2, "Wrong order in heap 6");

        for (uint i = 0; i < 6; i++) {
            TaskInQueue memory task = maxHeap.get(i + 1);
            Assert.isTrue(maxHeap.include(i + 1), "Wrong include");
            Assert.equal(task.taskFee, 100 * (i + 1), "Wrong get task");
        }
        Assert.isFalse(maxHeap.include(7), "Wrong include");

        TaskInQueue memory task;
        task = maxHeap.remove(3);
        Assert.equal(task.taskFee, 300, "Wrong remove task");
        task = maxHeap.remove(4);
        Assert.equal(task.taskFee, 400, "Wrong remove task");
        
        Assert.isFalse(maxHeap.include(3), "Wrong include");
        Assert.isFalse(maxHeap.include(4), "Wrong include");

        for (uint i = 0; i < 2; i++) {
            Assert.equal(maxHeap.top().id, 6 - i, "Wrong top");
            maxHeap.pop();
        }

        task = maxHeap.remove(1);
        Assert.equal(task.taskFee, 100, "Wrong remove task");
        task = maxHeap.remove(2);
        Assert.equal(task.taskFee, 200, "Wrong remove task");

    }

    function testMinHeap() public {
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

        Assert.equal(minHeap.tasks[1].id, 6, "Wrong order in heap 1");
        Assert.equal(minHeap.tasks[2].id, 4, "Wrong order in heap 2");
        Assert.equal(minHeap.tasks[3].id, 5, "Wrong order in heap 3");
        Assert.equal(minHeap.tasks[4].id, 1, "Wrong order in heap 4");
        Assert.equal(minHeap.tasks[5].id, 3, "Wrong order in heap 5");
        Assert.equal(minHeap.tasks[6].id, 2, "Wrong order in heap 6");

        for (uint i = 0; i < 6; i++) {
            TaskInQueue memory task = minHeap.get(i + 1);
            Assert.isTrue(minHeap.include(i + 1), "Wrong include");
            Assert.equal(task.taskFee, 100 * (6 - i), "Wrong get task");
        }
        Assert.isFalse(minHeap.include(7), "Wrong include");

        TaskInQueue memory task;
        task = minHeap.remove(3);
        Assert.equal(task.taskFee, 400, "Wrong remove task");
        task = minHeap.remove(4);
        Assert.equal(task.taskFee, 300, "Wrong remove task");
        
        Assert.isFalse(minHeap.include(3), "Wrong include");
        Assert.isFalse(minHeap.include(4), "Wrong include");

        for (uint i = 0; i < 2; i++) {
            Assert.equal(minHeap.top().id, 6 - i, "Wrong top");
            minHeap.pop();
        }

        task = minHeap.remove(1);
        Assert.equal(task.taskFee, 600, "Wrong remove task");
        task = minHeap.remove(2);
        Assert.equal(task.taskFee, 500, "Wrong remove task");
    }
}