const hre = require("hardhat");
const { assert } = require("chai");
const { utils } = require("web3");
const ecvrf = require("vrf-ts-256");
const EthCrypto = require("eth-crypto");
const { BN } = require("bn.js");

// Generate VRF Proof
// wallet: private key/public key wallet
// samplingSeed: 0x prefixed hex string
const generateVRFProofForWallet = (account, samplingSeed) => {
    const privateKey = account.privateKey;
    console.log("Private key: " + privateKey);

    const publicKey = account.publicKey;
    console.log("Compressed public key: " + publicKey);

    // Remove 0x prefix. Compressed keys start with '02' or '03'. Only X included.
    const compressedPublicKeyContent = publicKey.substring(2);

    // Both X and Y included. No 0x prefix. Non-compressed keys start with '04' or no prefix.
    const decompressedPublicKey = EthCrypto.publicKey.decompress(compressedPublicKeyContent);
    console.log("Decompressed public key: " + decompressedPublicKey);
    console.log("Decompressed public key length: " + decompressedPublicKey.length);

    // Remove 0x prefix.
    const privateKeyContent = privateKey.substring(2);
    const samplingSeedContent = samplingSeed.substring(2);

    // Generate VRF proof
    const vrfProof = ecvrf.prove(privateKeyContent, samplingSeedContent);
    console.log("VRF proof: " + JSON.stringify(vrfProof));

    const samplingNumberHex = ecvrf.proof_to_hash(vrfProof.pi);
    console.log("Sampling number hex: " + samplingNumberHex);

    const samplingNumberStr = utils.hexToNumberString("0x" + samplingNumberHex);
    console.log("Sampling number str: " + samplingNumberStr);

    const lastDigit = samplingNumberStr.substring(samplingNumberStr.length - 1);
    console.log("Sampling number last digit: " + lastDigit);

    const samplingNumber = new BN(samplingNumberHex, 16);
    const isSelectedForValidation = samplingNumber.mod(new BN(10)).eq(new BN(0));
    console.log("Is selected: " + isSelectedForValidation);

    assert.equal(parseInt(lastDigit) === 0, isSelectedForValidation, "incorrect selection judgement");

    return [vrfProof, decompressedPublicKey, isSelectedForValidation];
};

describe("VSS", () => {

    let testVSSInstance;

    before('deploy contracts', async () => {
        testVSSInstance = await hre.ethers.deployContract("TestVSS");
    });

    it("should pass the sampling number validation", async() => {
        const taskIDCommitment = utils.randomHex(32);
        const samplingSeed = await testVSSInstance.getSamplingSeed(taskIDCommitment);
        console.log("Sampling Seed: " + samplingSeed);
        assert.exists(samplingSeed);

        const [signer] = await hre.ethers.getSigners();

        const accounts = hre.config.networks.hardhat.accounts;
        const owner = hre.ethers.Wallet.fromPhrase(accounts.mnemonic);

        const address = owner.address;
        console.log("Derived address: " + address);
        console.log("Signer address: " + signer.address);

        assert.equal(signer.address, address, "Incorrect derived address");

        const [vrfProof, decompressedPublicKey, isSelectedForValidation] = generateVRFProofForWallet(owner, samplingSeed);

        try {
            const result = await testVSSInstance.validateSamplingNumber(
                "0x" + vrfProof.pi,
                "0x" + decompressedPublicKey,
                owner.address,
                samplingSeed,
                isSelectedForValidation
            );

            assert.isTrue(result, "vss validation failed");

        } catch (e) {
            assert.fail(e);
        }

        try {
            await testVSSInstance.validateSamplingNumber(
                "0x" + vrfProof.pi,
                "0x" + decompressedPublicKey,
                owner.address,
                samplingSeed,
                !isSelectedForValidation
            );

            assert.fail("Transaction should revert");

        } catch (e) {}

        try {
            await testVSSInstance.validateSamplingNumber(
                "0x" + vrfProof.pi,
                "0x" + decompressedPublicKey,
                faker.address,
                samplingSeed,
                isSelectedForValidation
            );

            assert.fail("Transaction should revert");

        } catch (e) {

        }

        // Generate a fake VRF proof
        const faker = owner.deriveChild(1);
        console.log("Faker address: " + faker.address);
        const [fakeVRFProof, fakeDecompressedPublicKey, fakeIsSelectedForValidation] = generateVRFProofForWallet(faker, samplingSeed);

        try {
            await testVSSInstance.validateSamplingNumber(
                "0x" + fakeVRFProof.pi,
                "0x" + fakeDecompressedPublicKey,
                faker.address,
                samplingSeed,
                fakeIsSelectedForValidation
            );

            assert.fail("Transaction should revert");

        } catch (e) {}
    });
});
