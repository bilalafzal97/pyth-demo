use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

declare_id!("8xAgQUjq4yURfNbmxN2nf9gZ3NizaGUotUjTWCAWAjaY");

#[program]
pub mod pyth_demo {
    use super::*;

    pub fn price_read(ctx: Context<PriceRead>, feed_id_hex: String) -> Result<()> {

        let price_update = &mut ctx.accounts.price_update;
        // get_price_no_older_than will fail if the price update is more than 5 seconds old
        let maximum_age: u64 = 7;
        // get_price_no_older_than will fail if the price update is for a different price feed.
        // This string is the id of the BTC/USD feed. See https://docs.pyth.network/price-feeds/price-feeds for all available IDs.
        // let feed_id: [u8; 32] = get_feed_id_from_hex("0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43")?;
        let feed_id: [u8; 32] = get_feed_id_from_hex(feed_id_hex.as_str())?;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;
        // Sample output:
        // The price is (7160106530699 ± 5129162301) * 10^-8
        msg!("The price is ({} ± {}) * 10^{}", price.price, price.conf, price.exponent);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct PriceRead<'info> {
    pub price_update: Account<'info, PriceUpdateV2>,
}