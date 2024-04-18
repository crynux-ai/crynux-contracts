const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Task", () => {
    it("should emit 3 TaskNodeSuccess when all nodes run correctly", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        for(let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]);

        const events = await v.taskInstance.queryFilter("TaskNodeSuccess");
        assert.equal(events.length, 3, "Wrong event count");
        for (const event of events) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 3).map(x=>x.address), event.args.nodeAddress);
        }
    });
});

describe("Task", () => {
    it("should emit 2 TaskNodeSuccess and 1 TaskNodeSlashed when two nodes run correctly and a node cheats", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";
        const fakeResult = "0x010203040506f7f8";

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        {
            const [commitment, nonce] = await v.getCommitment(fakeResult);
            await v.taskInstance.connect(v.accounts[2]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[2].address],
                commitment,
                nonce,
            );

        }

        for(let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }

        {
            await v.taskInstance.connect(v.accounts[2]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[2].address],
                fakeResult,
            );
        }

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]);

        const successEvents = await v.taskInstance.queryFilter("TaskNodeSuccess");
        assert.equal(successEvents.length, 2, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 2).map(x=>x.address), event.args.nodeAddress);
        }

        const slashEvents = await v.taskInstance.queryFilter("TaskNodeSlashed");
        assert.equal(slashEvents.length, 1, "Wrong event count");
        assert.equal(slashEvents[0].args.taskId.toString(), taskId.toString(), "Wrong taskId");
        assert.equal(slashEvents[0].args.nodeAddress, v.accounts[2].address, "Wrong taskId");
    });
});

describe("Task", () => {
    it("should emit 2 TaskNodeSuccess and 1 TaskNodeSlashed when two nodes run correctly and a node reports error", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        {
            await v.taskInstance.connect(v.accounts[2]).reportTaskError(
                taskId,
                nodeRounds[v.accounts[2].address],
            );
        }

        for(let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]);

        const successEvents = await v.taskInstance.queryFilter("TaskNodeSuccess");
        assert.equal(successEvents.length, 2, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 2).map(x=>x.address), event.args.nodeAddress);
        }

        const slashEvents = await v.taskInstance.queryFilter("TaskNodeSlashed");
        assert.equal(slashEvents.length, 1, "Wrong event count");
        assert.equal(slashEvents[0].args.taskId.toString(), taskId.toString(), "Wrong taskId");
        assert.equal(slashEvents[0].args.nodeAddress, v.accounts[2].address, "Wrong taskId");
    });
});

describe("Task", () => {
    it("should emit 2 TaskNodeSuccess and 1 TaskNodeCancelled when two nodes disclose correctly and a node is timeout", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        for(let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]);

        const successEvents = await v.taskInstance.queryFilter("TaskNodeSuccess");
        assert.equal(successEvents.length, 2, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 2).map(x=>x.address), event.args.nodeAddress);
        }

        await helpers.time.increase(helpers.time.duration.hours(1));
        await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);

        const cancelEvents = await v.taskInstance.queryFilter("TaskNodeCancelled");
        assert.equal(cancelEvents.length, 1, "Wrong event count");
        assert.equal(cancelEvents[0].args.taskId.toString(), taskId.toString(), "Wrong taskId");
        assert.equal(cancelEvents[0].args.nodeAddress, v.accounts[2].address, "Wrong taskId");
    });
});

describe("Task", () => {
    it("should emit 3 TaskNodeCancelled when two nodes submit result commitments correctly and a node is timeout", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        await helpers.time.increase(helpers.time.duration.hours(1));
        await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);

        const successEvents = await v.taskInstance.queryFilter("TaskNodeCancelled");
        assert.equal(successEvents.length, 3, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 3).map(x=>x.address), event.args.nodeAddress);
        }
    });
});

describe("Task", () => {
    it("should emit 3 TaskNodeCancelled when one node disclose correctly and two nodes are timeout", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            result,
        )

        await helpers.time.increase(helpers.time.duration.hours(1));
        await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);

        const events = await v.taskInstance.queryFilter("TaskNodeCancelled");
        assert.equal(events.length, 3, "Wrong event count");
        for (const event of events) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 3).map(x=>x.address), event.args.nodeAddress);
        }
    });
});

describe("Task", () => {
    it("should emit 3 TaskNodeSuccess when three nodes report task error", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);


        for(let i= 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).reportTaskError(
                taskId,
                nodeRounds[v.accounts[i].address],
            );
        }

        const events = await v.taskInstance.queryFilter("TaskNodeSuccess");
        assert.equal(events.length, 3, "Wrong event count");
        for (const event of events) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(v.accounts.slice(0, 3).map(x=>x.address), event.args.nodeAddress);
        }
    });
});
