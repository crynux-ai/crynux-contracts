// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "truffle/Assert.sol";
import "../contracts/TaskHeap.sol";

contract TestTaskHeap {
    using TaskHeap_impl for TaskHeap;

    TaskHeap private heap;

    function testHeap() public {
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

            heap.insert(task);
        }

        Assert.equal(heap.tasks[0].id, 6, "Wrong order in heap 0");
        Assert.equal(heap.tasks[1].id, 4, "Wrong order in heap 1");
        Assert.equal(heap.tasks[2].id, 5, "Wrong order in heap 2");
        Assert.equal(heap.tasks[3].id, 1, "Wrong order in heap 3");
        Assert.equal(heap.tasks[4].id, 3, "Wrong order in heap 3");
        Assert.equal(heap.tasks[5].id, 2, "Wrong order in heap 3");

        for (uint i = 0; i < 6; i++) {
            Assert.equal(heap.top().id, 6 - i, "Wrong top");
            heap.pop();
        }
    }
}