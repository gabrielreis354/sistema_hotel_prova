module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');

    await queryInterface.createTable('hotels', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      legal_id: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()')
      }
    });

    await queryInterface.addConstraint('hotels', {
      fields: ['name'],
      type: 'unique',
      name: 'hotels_name_unique'
    });

    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        allowNull: false,
        primaryKey: true
      },
      hotel_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'hotels', key: 'id' },
        onDelete: 'CASCADE'
      },
      name: { type: Sequelize.TEXT, allowNull: false },
      email: { type: Sequelize.TEXT, allowNull: false },
      password_hash: { type: Sequelize.TEXT, allowNull: false },
      role: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') }
    });

    await queryInterface.addConstraint('users', {
      fields: ['hotel_id', 'email'],
      type: 'unique',
      name: 'users_hotel_email_unique'
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('ADMIN', 'RECEPTIONIST'));
    `);

    await queryInterface.createTable('room_categories', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('uuid_generate_v4()'), allowNull: false, primaryKey: true },
      hotel_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'hotels', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: Sequelize.TEXT, allowNull: false },
      capacity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      price_per_night: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') }
    });

    await queryInterface.addConstraint('room_categories', {
      fields: ['hotel_id', 'name'],
      type: 'unique',
      name: 'room_categories_hotel_name_unique'
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE room_categories
      ADD CONSTRAINT room_categories_capacity_check
      CHECK (capacity > 0),
      ADD CONSTRAINT room_categories_price_check
      CHECK (price_per_night >= 0);
    `);

    await queryInterface.createTable('rooms', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('uuid_generate_v4()'), allowNull: false, primaryKey: true },
      hotel_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'hotels', key: 'id' }, onDelete: 'CASCADE' },
      category_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'room_categories', key: 'id' }, onDelete: 'RESTRICT' },
      number: { type: Sequelize.TEXT, allowNull: false },
      floor: { type: Sequelize.INTEGER, allowNull: true },
      status: { type: Sequelize.TEXT, allowNull: false, defaultValue: 'AVAILABLE' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') }
    });

    await queryInterface.addConstraint('rooms', {
      fields: ['hotel_id', 'number'],
      type: 'unique',
      name: 'rooms_hotel_number_unique'
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE rooms
      ADD CONSTRAINT rooms_status_check
      CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'));
    `);

    await queryInterface.createTable('guests', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('uuid_generate_v4()'), allowNull: false, primaryKey: true },
      hotel_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'hotels', key: 'id' }, onDelete: 'CASCADE' },
      full_name: { type: Sequelize.TEXT, allowNull: false },
      cpf: { type: Sequelize.TEXT, allowNull: true },
      phone: { type: Sequelize.TEXT, allowNull: true },
      email: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') }
    });

    await queryInterface.addConstraint('guests', {
      fields: ['hotel_id', 'cpf'],
      type: 'unique',
      name: 'guests_hotel_cpf_unique'
    });

    await queryInterface.addConstraint('guests', {
      fields: ['hotel_id', 'email'],
      type: 'unique',
      name: 'guests_hotel_email_unique'
    });

    await queryInterface.createTable('reservations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('uuid_generate_v4()'), allowNull: false, primaryKey: true },
      hotel_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'hotels', key: 'id' }, onDelete: 'CASCADE' },
      guest_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'guests', key: 'id' }, onDelete: 'RESTRICT' },
      room_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'rooms', key: 'id' }, onDelete: 'RESTRICT' },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
      check_in_date: { type: Sequelize.DATEONLY, allowNull: false },
      check_out_date: { type: Sequelize.DATEONLY, allowNull: false },
      status: { type: Sequelize.TEXT, allowNull: false, defaultValue: 'PENDING' },
      total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE reservations
      ADD CONSTRAINT reservations_status_check
      CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
      ADD CONSTRAINT reservations_dates_check
      CHECK (check_out_date > check_in_date),
      ADD CONSTRAINT reservations_amount_check
      CHECK (total_amount >= 0);
    `);

    await queryInterface.addIndex('reservations', ['hotel_id', 'check_in_date'], {
      name: 'idx_reservations_hotel_checkin'
    });
    await queryInterface.addIndex('reservations', ['hotel_id', 'check_out_date'], {
      name: 'idx_reservations_hotel_checkout'
    });
    await queryInterface.addIndex('rooms', ['hotel_id', 'status'], {
      name: 'idx_rooms_hotel_status'
    });
    await queryInterface.addIndex('users', ['hotel_id', 'email'], {
      name: 'idx_users_hotel_email'
    });
    await queryInterface.addIndex('guests', ['hotel_id', 'cpf'], {
      name: 'idx_guests_hotel_cpf'
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE reservations
      ADD CONSTRAINT reservations_room_no_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in_date, check_out_date, '[)') WITH &&
      );
    `);

    await queryInterface.createTable('payments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('uuid_generate_v4()'), allowNull: false, primaryKey: true },
      reservation_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'reservations', key: 'id' }, onDelete: 'CASCADE' },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      method: { type: Sequelize.TEXT, allowNull: false },
      paid_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE payments
      ADD CONSTRAINT payments_amount_check
      CHECK (amount >= 0),
      ADD CONSTRAINT payments_method_check
      CHECK (method IN ('CARD', 'CASH', 'TRANSFER'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('reservations');
    await queryInterface.dropTable('guests');
    await queryInterface.dropTable('rooms');
    await queryInterface.dropTable('room_categories');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('hotels');
  }
};
