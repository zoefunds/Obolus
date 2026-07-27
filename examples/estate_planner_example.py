# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Worked consumer example for VerifiableDeceaseEscrow (VDE).

A minimal digital-legacy registry: a builder-facing contract that lets a
user list which of their other on-chain holdings (NFTs, role grants, other
vault ids) should be handed to a named successor, and simply POINTS at a
VDE vault id as the trust anchor for "has the owner actually died." All of
VDE's machinery — evidence, contest window, bonds, the nondet verdict — is
untouched here; this contract contains none of it.

This is the whole integration surface: create a legacy entry with a VDE
vault id, and read back whether that vault has paid out.
"""

from genlayer import *


@gl.contract_interface
class VerifiableDeceaseEscrowInterface:
    class View:
        def get_vault(self, vault_id: int) -> dict: ...

    class Write:
        pass


class DigitalLegacyRegistry(gl.Contract):
    """Tiny consumer: binds a successor address to a VDE vault id, and
    exposes whether succession has actually triggered."""

    vde_address: Address
    successors: TreeMap[Address, Address]   # owner -> successor
    vde_vault_ids: TreeMap[Address, u32]    # owner -> their VDE vault id

    def __init__(self, vde_address: str):
        self.vde_address = Address(vde_address)

    @gl.public.write
    def register_succession(self, successor: str, vde_vault_id: int) -> None:
        """Owner points at their own VDE vault: the id of the decease-escrow
        vault they created on VerifiableDeceaseEscrow with themself as the
        subject. This contract trusts VDE's verdict, not the caller."""
        owner = gl.message.sender_address
        self.successors[owner] = Address(successor)
        self.vde_vault_ids[owner] = u32(vde_vault_id)

    @gl.public.view
    def succession_triggered(self, owner: str) -> bool:
        """True once the linked VDE vault has actually paid out — i.e.
        validator consensus confirmed the owner's death — never before."""
        owner_addr = Address(owner)
        vault_id = self.vde_vault_ids.get(owner_addr)
        if vault_id is None:
            return False
        vde = VerifiableDeceaseEscrowInterface(self.vde_address)
        vault = vde.get_vault(int(vault_id))
        return vault["status"] == "PAYOUT_READY"

    @gl.public.view
    def get_successor(self, owner: str) -> str:
        successor = self.successors.get(Address(owner))
        return successor.as_hex if successor is not None else ""
