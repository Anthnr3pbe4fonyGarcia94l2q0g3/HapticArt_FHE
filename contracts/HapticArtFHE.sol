
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract HapticArtFHE is SepoliaConfig {
    // Identifier counter for tactile samples
    uint256 public sampleCount;

    // Structure for encrypted tactile input captured from an interaction
    struct EncryptedSample {
        uint256 id;
        euint32 encryptedIntensity;    // encrypted intensity reading
        euint32 encryptedFrequency;    // encrypted frequency reading
        euint32 encryptedContactType;  // encrypted contact/type marker
        uint256 timestamp;
        address submitter;
    }

    // Structure for revealed transformation parameters (after decryption)
    struct Transformation {
        string shapeDescriptor;
        string textureDescriptor;
        bool revealed;
    }

    // Mappings for storage
    mapping(uint256 => EncryptedSample) public encryptedSamples;
    mapping(uint256 => Transformation) public transformations;

    // Tracking decryption requests to corresponding sample id
    mapping(uint256 => uint256) private requestToSampleId;

    // Event loggers
    event SampleSubmitted(uint256 indexed id, address indexed submitter, uint256 timestamp);
    event TransformationRequested(uint256 indexed sampleId, uint256 indexed requestId);
    event TransformationRevealed(uint256 indexed sampleId);

    // Access control placeholder modifier
    modifier onlySubmitter(uint256 sampleId) {
        // Intended for future access control checks
        _;
    }

    // Submit an encrypted tactile sample
    function submitEncryptedSample(
        euint32 encryptedIntensity,
        euint32 encryptedFrequency,
        euint32 encryptedContactType
    ) public {
        sampleCount += 1;
        uint256 newId = sampleCount;

        encryptedSamples[newId] = EncryptedSample({
            id: newId,
            encryptedIntensity: encryptedIntensity,
            encryptedFrequency: encryptedFrequency,
            encryptedContactType: encryptedContactType,
            timestamp: block.timestamp,
            submitter: msg.sender
        });

        transformations[newId] = Transformation({
            shapeDescriptor: "",
            textureDescriptor: "",
            revealed: false
        });

        emit SampleSubmitted(newId, msg.sender, block.timestamp);
    }

    // Request decryption and transformation generation for a sample
    function requestTransformation(uint256 sampleId) public onlySubmitter(sampleId) {
        EncryptedSample storage s = encryptedSamples[sampleId];
        require(s.id != 0, "Invalid sample");
        require(!transformations[sampleId].revealed, "Already revealed");

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(s.encryptedIntensity);
        ciphertexts[1] = FHE.toBytes32(s.encryptedFrequency);
        ciphertexts[2] = FHE.toBytes32(s.encryptedContactType);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.handleDecryption.selector);
        requestToSampleId[reqId] = sampleId;

        emit TransformationRequested(sampleId, reqId);
    }

    // Callback invoked by FHE runtime with decryption results
    function handleDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 sampleId = requestToSampleId[requestId];
        require(sampleId != 0, "Unknown request");

        Transformation storage t = transformations[sampleId];
        require(!t.revealed, "Already processed");

        // Validate proof and integrity with FHE helper
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts into expected strings
        string[] memory results = abi.decode(cleartexts, (string[]));

        // Populate transformation descriptors
        t.shapeDescriptor = results.length > 0 ? results[0] : "";
        t.textureDescriptor = results.length > 1 ? results[1] : "";
        t.revealed = true;

        emit TransformationRevealed(sampleId);
    }

    // Retrieve the revealed transformation for a sample
    function getTransformation(uint256 sampleId) public view returns (
        string memory shapeDescriptor,
        string memory textureDescriptor,
        bool revealed
    ) {
        Transformation storage t = transformations[sampleId];
        return (t.shapeDescriptor, t.textureDescriptor, t.revealed);
    }

    // Utility to request decryption of aggregated metrics
    mapping(string => euint32) private encryptedMetric;
    string[] private metricKeys;

    // Store a new encrypted metric (on-chain)
    function storeEncryptedMetric(string memory key, euint32 value) public {
        if (!FHE.isInitialized(encryptedMetric[key])) {
            encryptedMetric[key] = value;
            metricKeys.push(key);
        } else {
            encryptedMetric[key] = FHE.add(encryptedMetric[key], value);
        }
    }

    // Request decryption of a named metric
    function requestMetricDecryption(string memory key) public {
        euint32 val = encryptedMetric[key];
        require(FHE.isInitialized(val), "Metric not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(val);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.handleMetricDecryption.selector);
        // Map request id to a pseudo-id computed from key hash
        requestToSampleId[reqId] = uint256(keccak256(abi.encodePacked(key)));
    }

    // Callback for metric decryption
    function handleMetricDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 pseudoId = requestToSampleId[requestId];
        require(pseudoId != 0, "Unknown request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 decryptedValue = abi.decode(cleartexts, (uint32));
        // The decrypted metric can be emitted or used off-chain
        // Emitting for visibility
        emit MetricDecrypted(pseudoId, decryptedValue);
    }

    event MetricDecrypted(uint256 indexed pseudoId, uint32 value);

    // Helper to convert stored sample submitter if needed
    function getSampleSubmitter(uint256 sampleId) public view returns (address) {
        EncryptedSample storage s = encryptedSamples[sampleId];
        return s.submitter;
    }

    // Administrative reset of a sample's revealed state (placeholder)
    function resetTransformationReveal(uint256 sampleId) public {
        // Intended for administrative workflows
        transformations[sampleId].revealed = false;
    }

    // Return a list of metric keys (limited view)
    function listMetricKeys() public view returns (string[] memory) {
        return metricKeys;
    }

    // Return sample basic info
    function getEncryptedSampleInfo(uint256 sampleId) public view returns (
        uint256 id,
        uint256 timestamp,
        address submitter,
        bool revealed
    ) {
        EncryptedSample storage s = encryptedSamples[sampleId];
        Transformation storage t = transformations[sampleId];
        return (s.id, s.timestamp, s.submitter, t.revealed);
    }

    // Fallback functions to accept ETH (if needed)
    receive() external payable {}
    fallback() external payable {}
}
