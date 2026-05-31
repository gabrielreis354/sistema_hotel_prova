module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'hotels_name_unique'
        ) THEN
          ALTER TABLE hotels
          ADD CONSTRAINT hotels_name_unique UNIQUE (name);
        END IF;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('hotels', 'hotels_name_unique');
  }
};
