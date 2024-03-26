const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("TaskHeap", () => {

    it("testMaxHeap", async () => {
        let v = await ethers.deployContract("TestTaskHeap");
        await v.testMaxHeapInsert();
        let tasks = await v.getMaxHeapTask();
        assert.equal(tasks[1].id, 6);
        assert.equal(tasks[2].id, 4);
        assert.equal(tasks[3].id, 5);
        assert.equal(tasks[4].id, 1);
        assert.equal(tasks[5].id, 3);
        assert.equal(tasks[6].id, 2);
        for (let i = 0; i < 6; i++) {
            task = await v.maxHeapGet(i + 1);
            assert.isTrue(await v.maxHeapInclude(i + 1), "Wrong include");
            assert.equal(task.taskFee, 100 * (i + 1), "Wrong get task");
        }
        assert.isFalse(await v.maxHeapInclude(7), "Wrong include");

        await v.testMaxHeapRemove(3);
        await v.testMaxHeapRemove(4);
        res = await v.removeTaskRes(0);
        assert.equal(res.taskFee, 300);
        res = await v.removeTaskRes(1);
        assert.equal(res.taskFee, 400);
        assert.isFalse(await v.maxHeapInclude(3));
        assert.isFalse(await v.maxHeapInclude(4));

        for (let i = 0; i < 2; i++) {
            let res = await v.maxHeapTop();
            assert.equal(await res.id, 6 - i, "Wrong top");
            await v.maxHeapPop();
        }

        await v.testMaxHeapRemove(1);
        await v.testMaxHeapRemove(2);
        res = await v.removeTaskRes(2);
        assert.equal(res.taskFee, 100);
        res = await v.removeTaskRes(3);
        assert.equal(res.taskFee, 200);
    });

    it("testMinHeap", async () => {
        let v = await ethers.deployContract("TestTaskHeap");
        await v.testMinHeapInsert();
        let tasks = await v.getMinHeapTask();
        assert.equal(tasks[1].id, 6);
        assert.equal(tasks[2].id, 4);
        assert.equal(tasks[3].id, 5);
        assert.equal(tasks[4].id, 1);
        assert.equal(tasks[5].id, 3);
        assert.equal(tasks[6].id, 2);

        for (let i = 0; i < 6; i++) {
            task = await v.minHeapGet(i + 1);
            assert.isTrue(await v.minHeapInclude(i + 1), "Wrong include");
            assert.equal(task.taskFee, 100 * (6 - i), "Wrong get task");
        }
        assert.isFalse(await v.minHeapInclude(7), "Wrong include");

        await v.testMinHeapRemove(3);
        await v.testMinHeapRemove(4);
        res = await v.removeTaskRes(0);
        assert.equal(res.taskFee, 400);
        res = await v.removeTaskRes(1);
        assert.equal(res.taskFee, 300);
        assert.isFalse(await v.maxHeapInclude(3));
        assert.isFalse(await v.maxHeapInclude(4));

        for (let i = 0; i < 2; i++) {
            let res = await v.minHeapTop();
            assert.equal(await res.id, 6 - i, "Wrong top");
            await v.minHeapPop();
        }

        await v.testMinHeapRemove(1);
        await v.testMinHeapRemove(2);
        res = await v.removeTaskRes(2);
        assert.equal(res.taskFee, 600);
        res = await v.removeTaskRes(3);
        assert.equal(res.taskFee, 500);
    });
});
