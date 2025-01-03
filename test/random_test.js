const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

const randint = async (v) => {
    await v.randint();
    const res = await v.intRes();
    return res;
}

const randrange = async (v, start, end) => {
    await v.randrange(start, end);
    const res = await v.intRes();
    return res;
}

const choice = async (v, weights) => {
    await v.choice(weights);
    const index = await v.intRes();
    return index;
}

const choices = async (v, weights, k) => {
    await v.choices(weights, k);
    const indices = [];
    for (let i = 0; i < k; i++) {
        const index = await v.arrRes(i);
        indices.push(index);
    }
    return indices;
}


describe("Random", () => {
    let v;

    before('deploy contracts', async () => {
        v = await ethers.deployContract("TestRandom");
    });


    it("testManualSeed", async () => {
        const seed = ethers.zeroPadBytes(ethers.randomBytes(32), 32);
        await v.manualSeed(seed);
        const remoteSeed = await v.getSeed();
        const remoteNonce = await v.getNonce();
        assert.equal(seed, remoteSeed);
        assert.equal(remoteNonce, 0);
    });

    it("testRandint", async () => {
        const seed = ethers.randomBytes(32);
        await v.manualSeed(seed);
        const res = await randint(v);
        assert.isAtLeast(res, 0);
    });

    it("testRandrange", async () => {
        const seed = ethers.randomBytes(32);
        await v.manualSeed(seed);
        const res = await randrange(v, 0, 1024);
        assert.isAtLeast(res, 0);
        assert.isBelow(res, 1024);
    });

    it("testChoice", async () => {
        const seed = ethers.randomBytes(32);
        await v.manualSeed(seed);
        const index = await choice(v, [1,2,3,4]);
        assert.isAtLeast(index, 0);
        assert.isBelow(index, 4);

        const indexCount = [0, 0, 0, 0];
        for (let i = 0; i < 100; i++) {
            await v.choice([1,2,3,4]);
            const index = await v.intRes();
            indexCount[index]++;
        }
        const maxIndex = indexCount.reduce((iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0);
        assert.equal(maxIndex, 3);
    });

    it("testChoices", async () => {
        const seed = ethers.randomBytes(32);
        await v.manualSeed(seed);
        let indices = await choices(v, [1,2,3], 3);
        assert.lengthOf(indices, 3);
        for (const i of indices) {
            assert.isAtLeast(i, 0);
            assert.isBelow(i, 3);
        }
        indices = await choices(v, [1,2,3,4,10,20,30,40], 4);
        assert.lengthOf(indices, 4);
        for (const i of indices) {
            assert.isAtLeast(i, 0);
            assert.isBelow(i, 8);
        }

        const indexCount = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 100; i++) {
            const indices = await choices(v, [1,2,3,4,10,20,30,40], 4);
            for (const index of indices) {
                indexCount[index]++;
            }
        }
        const maxIndex = indexCount.reduce((iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0);
        assert.equal(maxIndex, 7);
    });
});
