module 0x7fd0c76779a6c8802c0c8c6b7954506ceec977d12028516927c4eb25cda0b518::rwa_registry {

    use std::signer;
    use std::vector;
    use aptos_std::table;

    /// Resource storing trusted attestors
    struct TrustedAttestors has key {
        attestors: table::Table<address, bool>,
    }

    /// Certificate resource
    struct Certificate has key {
        owner: address,
        ipfs_cid: vector<u8>,
        kwh: u64,
    }

    /// Initialize the registry (only once by admin)
    public entry fun init(admin: &signer) {
        let attestors_table = table::new<address, bool>();
        move_to(admin, TrustedAttestors { attestors: attestors_table });
    }

    /// Add a new trusted attestor (admin only)
    public entry fun add_attestor(admin: &signer, new_attestor: address) acquires TrustedAttestors {
        let t = borrow_global_mut<TrustedAttestors>(signer::address_of(admin));
        table::add(&mut t.attestors, new_attestor, true);
    }

    /// Check if an address is a trusted attestor
    public fun is_trusted_attestor(admin_addr: address, candidate: address): bool acquires TrustedAttestors {
        table::contains(&borrow_global<TrustedAttestors>(admin_addr).attestors, candidate)
    }

    /// Issue a new certificate to a user
    public entry fun issue_certificate(
        attestor: &signer,
        to: address,
        cid_bytes: vector<u8>,
        kwh: u64
    ) acquires TrustedAttestors {
        let attestor_addr = signer::address_of(attestor);
        assert!(is_trusted_attestor(attestor_addr, attestor_addr), 1);

        let cert = Certificate {
            owner: to,
            ipfs_cid: cid_bytes,
            kwh: kwh,
        };

        move_to(attestor, cert);
    }
}
