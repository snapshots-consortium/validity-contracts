// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @author Blockchain Competence Center Mittweida
/// @notice This contract is used to reach consensus over arbitrary web content
contract Snapshots {
    // state
    address public immutable owner; // address owner
    uint256 public totalValidators; // number of validators
    bool public paused; // contract paused (true/false)
    uint256[] requiredMajority; // requiredMajority[0] = numerator, requiredMajority[1] = denominator
    uint256 votingTime; // voting time for validators in seconds

    mapping(string => Snapshot) public snapshots; // uuid => Snapshot
    mapping(string => string[]) public history; // url => array of uuid

    mapping(address => bool) public validators; // registered validators
    mapping(address => bool) public requesters; // registered requesters

    struct Snapshot {
        // info: all value below here are set on snapshot creation
        string url; // url of snapshot
        string element; // DOM element (optional)
        uint256 timestamp; // time of creation
        uint256 votingTime; // vothing time for validators
        address requester; // account of requester
        uint256 potentialVotes; // amount of current validators
        uint256 votesRequiredForMajority; // amount of votes required for majority (calculated on creation)
        // info: all values below here are updated while voting
        uint256 totalVotes; // increments on vote
        mapping(address => bytes32) votes; // address validator => hash (checksum)
        mapping(bytes32 => uint256) voteCount; // hash (checksum) => amount (increments on vote)
        bytes32[] uniqueHashes; // store unique hashes
        bool isValid; // status, true once the snapshot is valid, false otherwise
        bytes32 consensusHash; // hash (checksum) if snapshot is valid
    }

    // Events
    event SnapshotRequested(
        string uuid,
        string url,
        string element,
        address requester,
        uint256 timestamp,
        uint256 totalValidators,
        uint256 votesRequiredForMajority
    );

    event SnapshotCompleted(string uuid, bytes32 consensusHash, uint256 totalVotes, address validator);
    event SnapshotFinalized(string uuid, bool isValid, address validator);
    event ValidatorUpdated(address indexed account, bool isValidator);
    event RequesterUpdated(address indexed account, bool isRequester);

    // Modifiers to restrict function access
    modifier onlyOwner() {
        require(msg.sender == owner, 'Not the contract owner');
        _;
    }
    modifier onlyValidator() {
        require(validators[msg.sender], 'Not a validator');
        _;
    }
    modifier onlyRequester() {
        require(requesters[msg.sender], 'Not a requester');
        _;
    }

    modifier whenNotPaused() {
        require(paused == false, 'Contract is paused');
        _;
    }

    // Constructor with voting time, numerator and denominator of required majority (e.g. 2 and 3 = 2/3)
    // and initial inivalidator and requester accounts
    constructor(
        uint256 _votingTime,
        uint256 _numeratorRequiredMajority,
        uint256 _denominatorRequiredMajority,
        address[] memory _initialValidators,
        address[] memory _initialRequesters
    ) {
        // voting time must be greater than 0
        require(_votingTime > 0, 'Voting time must be greather than 0');

        // denominator must be greather than 0
        require(_denominatorRequiredMajority > 0, 'Denominator cannot be 0');
        // numerator must be smaller/equal than denominator (i.e. majority cannot be greater than 1 = 100%)
        require(
            _numeratorRequiredMajority <= _denominatorRequiredMajority,
            'Numerator cannot be greater than Denominator'
        );

        // info: _initialValidators and _initialRequesters can be empty
        // (i.e. no initial validators, no initial requesters)

        owner = msg.sender; // set owner

        votingTime = _votingTime; // set voting time

        requiredMajority = [
            _numeratorRequiredMajority,
            _denominatorRequiredMajority
        ]; // set numerator and denominator for required majority (e.g. 2 and 3 = 2/3)

        // set initial validators
        for (uint256 i = 0; i < _initialValidators.length; i++) {
            validators[_initialValidators[i]] = true;
            totalValidators++;
            // emit ValidatorUpdated(_initialValidators[i], true);
        }

        // set initial requesters
        for (uint256 i = 0; i < _initialRequesters.length; i++) {
            requesters[_initialRequesters[i]] = true;
            // emit RequesterUpdated(_initialRequesters[i], true);
        }
    }

    // Function to request a snapshot
    function requestSnapshot(
        string memory _uuid,
        string memory _url,
        string memory _element
    ) public onlyRequester whenNotPaused {
        // check if snapshot already exists for given uuid
        require(snapshots[_uuid].timestamp == 0, 'Snapshot already requested');
        // check if url is given
        require(bytes(_url).length > 0, 'URL cannot be empty');

        // info: element can be empty (i.e. "")

        // at least one validator is required for a snapshot
        require(totalValidators > 0, 'At least 1 validator is required');

        // calculate absolute number of votes required for majority
        // always round up (2/3 of 20 = 13,3 = 14)
        // (grundmenge * zaehler + nenner - 1) / nenner
        uint256 requiredVotes = (totalValidators *
            requiredMajority[0] +
            requiredMajority[1] -
            1) / requiredMajority[1];

        // save snapshot details
        Snapshot storage snapshot = snapshots[_uuid];
        snapshot.url = _url;
        snapshot.element = _element;
        snapshot.timestamp = block.timestamp;
        snapshot.votingTime = votingTime;
        snapshot.requester = msg.sender;
        snapshot.potentialVotes = totalValidators;
        snapshot.votesRequiredForMajority = requiredVotes;

        // this event is important!!
        emit SnapshotRequested(
            _uuid,
            _url,
            _element,
            msg.sender,
            block.timestamp,
            totalValidators,
            requiredVotes
        );
    }

    // Function for validators to submit their hash
    function submitHash(
        string memory _uuid,
        bytes32 _hash
    ) public onlyValidator whenNotPaused {
        Snapshot storage snapshot = snapshots[_uuid];
        // check if snapshot exists for given uuid
        require(
            snapshot.timestamp != 0,
            'No snapshot available for given UUID'
        );
        // submitted checksum must be a valid hash
        require(_hash != 0, 'Checksum cannot be empty');
        // hash must be submitted within voting time
        require(
            block.timestamp - snapshot.timestamp < snapshot.votingTime,
            'Snapshot not eligible for voting'
        );
        // every validator can only vote once
        require(snapshot.votes[msg.sender] == 0, 'Validator has already voted');

        // save hash, if this is the first vote for this hash save it in uniqueHashes as well
        snapshot.votes[msg.sender] = _hash;
        if (snapshot.voteCount[_hash] == 0) {
            snapshot.uniqueHashes.push(_hash);
        }
        // increment counters
        snapshot.voteCount[_hash]++;
        snapshot.totalVotes++;

        // Check if consensus is reached
        if (snapshot.voteCount[_hash] == snapshot.votesRequiredForMajority) {
            snapshot.isValid = true;
            snapshot.consensusHash = _hash;
            history[snapshot.url].push(_uuid);
            emit SnapshotCompleted(_uuid, _hash, snapshot.totalVotes, msg.sender);
        } 

        // Check if all validatores voted
        if (snapshot.totalVotes == snapshot.potentialVotes) {
            emit SnapshotFinalized(_uuid, snapshot.isValid, msg.sender);
        }
    }

    /* Owner management functions */

    // Function to add an account to the validators
    function addToValidators(address _account) public onlyOwner {
        if (!validators[_account]) {
            validators[_account] = true;
            totalValidators++;
            emit ValidatorUpdated(_account, true);
        }
    }

    // Function to remove an account from the validators
    function removeFromValidators(address _account) public onlyOwner {
        if (validators[_account]) {
            validators[_account] = false;
            totalValidators--;
            emit ValidatorUpdated(_account, false);
        }
    }

    // Function to add an account to the requesters
    function addToRequesters(address _account) public onlyOwner {
        if (!requesters[_account]) {
            requesters[_account] = true;
            emit RequesterUpdated(_account, true);
        }
    }

    // Function to remove an account from the requesters
    function removeFromRequesters(address _account) public onlyOwner {
        if (requesters[_account]) {
            requesters[_account] = false;
            emit RequesterUpdated(_account, false);
        }
    }

    // Function to update required majority
    function updateRequiredMajority(
        uint256 _numerator,
        uint256 _denominator
    ) public onlyOwner {
        require(_denominator > 0, 'Denominator cannot be 0');
        require(
            _numerator <= _denominator,
            'Numerator cannot be greater than Denominator'
        );
        requiredMajority = [_numerator, _denominator];
    }

    // Function to update voting time
    function updateVotingTime(uint256 _votingTime) public onlyOwner {
        require(_votingTime > 0, 'Voting time must be greather than 0');
        votingTime = _votingTime;
    }

    // Function to pause contract
    function pause() external onlyOwner {
        paused = true;
    }

    // Function to unpause contract
    function unpause() external onlyOwner {
        paused = false;
    }

    /* View functions */

    // Get validity for a given snapshot UUID
    function verifySnapshot(string memory _uuid) public view returns (bool) {
        return snapshots[_uuid].isValid;
    }

    // Get historic snapshot UUIDs for a given URL
    function getHistory(
        string memory _url
    ) public view returns (string[] memory) {
        return history[_url];
    }

    // Get the consensus hash for a given snapshot UUID
    function getConsensusHash(
        string memory _uuid
    ) public view returns (bytes32) {
        return snapshots[_uuid].consensusHash;
    }

    // Get the winning vote count and total votes for a given snapshot UUID
    function getVotes(
        string memory _uuid
    ) public view returns (uint256, uint256) {
        return (snapshots[_uuid].voteCount[snapshots[_uuid].consensusHash],
            snapshots[_uuid].totalVotes);
    }


    // todo: add more view functions
}
