use anchor_lang::prelude::*;

declare_id!("411nw24abKMmqgmUXMeNgwuLytABW2HBZVR85rLGNKSY");

#[program]
pub mod clios_archive {
    use super::*;

    pub fn aggiungi_fatto(
        ctx: Context<AggiungiFatto>,
        topic: String,
        description: String,
        category: String,
        event_date: i64,
        source_url: String,
    ) -> Result<()> {
        let record = &mut ctx.accounts.record;
        let author = &ctx.accounts.author;
        let clock = Clock::get()?;

        require!(topic.chars().count() <= 50, ErrorCode::TopicTooLong);
        require!(description.chars().count() <= 280, ErrorCode::DescriptionTooLong);

        record.author = author.key();
        record.timestamp_upload = clock.unix_timestamp;
        record.timestamp_event = event_date;
        record.topic = topic;
        record.description = description;
        record.category = category;
        record.source_url = source_url;

        msg!("Fatto storico salvato: {}", record.topic);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct AggiungiFatto<'info> {
    #[account(init, payer = author, space = 8 + 32 + 8 + 8 + 54 + 284 + 24 + 104)]
    pub record: Account<'info, HistoricalRecord>,
    #[account(mut)]
    pub author: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct HistoricalRecord {
    pub author: Pubkey,
    pub timestamp_upload: i64,
    pub timestamp_event: i64,
    pub topic: String,
    pub description: String,
    pub category: String,
    pub source_url: String,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Il titolo è troppo lungo (max 50 caratteri).")]
    TopicTooLong,
    #[msg("La descrizione è troppo lunga (max 280 caratteri).")]
    DescriptionTooLong,
}
