module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO hotels (name, legal_id)
      VALUES
        ('Hotel Aurora', '00.000.000/0001-01'),
        ('Pousada Sol', '00.000.000/0001-02')
      ON CONFLICT (name) DO UPDATE SET legal_id = EXCLUDED.legal_id;
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO room_categories (hotel_id, name, capacity, price_per_night)
      SELECT h.id, 'Standard', 2, 120.00
      FROM hotels h
      WHERE h.name = 'Hotel Aurora'
      ON CONFLICT (hotel_id, name) DO NOTHING;
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO room_categories (hotel_id, name, capacity, price_per_night)
      SELECT h.id, 'Suite', 4, 320.00
      FROM hotels h
      WHERE h.name = 'Hotel Aurora'
      ON CONFLICT (hotel_id, name) DO NOTHING;
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO rooms (hotel_id, category_id, number, floor, status)
      SELECT h.id, rc.id, '101', 1, 'AVAILABLE'
      FROM hotels h
      JOIN room_categories rc ON h.id = rc.hotel_id
      WHERE h.name = 'Hotel Aurora' AND rc.name = 'Standard'
      ON CONFLICT (hotel_id, number) DO NOTHING;
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO users (hotel_id, name, email, password_hash, role)
      SELECT h.id, 'Admin Local', 'admin@aurora.example', 'HASHED_PASSWORD_PLACEHOLDER', 'ADMIN'
      FROM hotels h
      WHERE h.name = 'Hotel Aurora'
      ON CONFLICT (hotel_id, email) DO NOTHING;
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO guests (hotel_id, full_name, cpf, phone, email)
      SELECT h.id, 'João Silva', '11122233344', '+55-11-90000-0000', 'joao@example.com'
      FROM hotels h
      WHERE h.name = 'Hotel Aurora'
      ON CONFLICT (hotel_id, cpf) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@aurora.example' });
    await queryInterface.bulkDelete('rooms', { number: '101' });
    await queryInterface.bulkDelete('room_categories', { name: ['Standard', 'Suite'] });
    await queryInterface.bulkDelete('guests', { cpf: '11122233344' });
    await queryInterface.bulkDelete('hotels', { name: ['Hotel Aurora', 'Pousada Sol'] });
  }
};
