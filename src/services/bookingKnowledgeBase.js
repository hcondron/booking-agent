import fs from "fs/promises";
import path from "path";

class BookingKnowledgeBase {
  constructor() {
    this.dataFilePath = path.join(process.cwd(), "data", "availableSlots.json");
    this.bookingsFilePath = path.join(process.cwd(), "data", "bookings.json");
    this.availableSlots = [];
    this.bookings = {};
    this.initialized = false;
  }

  async init() {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });

      // Load available slots
      try {
        const data = await fs.readFile(this.dataFilePath, "utf8");
        this.availableSlots = JSON.parse(data);
      } catch (error) {
        // If file doesn't exist or is invalid, create default slots
        this.availableSlots = this.generateDefaultSlots();
        await this.saveAvailableSlots();
      }

      // Load existing bookings
      try {
        const bookingsData = await fs.readFile(this.bookingsFilePath, "utf8");
        this.bookings = JSON.parse(bookingsData);
      } catch (error) {
        // If file doesn't exist or is invalid, create empty bookings object
        this.bookings = {};
        await this.saveBookings();
      }

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize booking knowledge base:", error);
      throw error;
    }
  }

  generateDefaultSlots() {
    const slots = [];
    const startDate = new Date();

    // Generate slots for the next 14 days
    for (let day = 0; day < 14; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + day);

      // Skip generating slots for today if it's past 5 PM
      if (day === 0 && startDate.getHours() >= 17) {
        continue;
      }

      // Generate slots from 9 AM to 5 PM with 1-hour intervals
      for (let hour = 9; hour < 17; hour++) {
        // Skip past hours for today
        if (day === 0 && hour <= startDate.getHours()) {
          continue;
        }

        const slotDate = new Date(currentDate);
        slotDate.setHours(hour, 0, 0, 0);

        slots.push({
          id: `${slotDate.toISOString()}`,
          date: slotDate.toISOString().split("T")[0],
          time: `${hour}:00`,
          available: true,
        });
      }
    }

    return slots;
  }

  async saveAvailableSlots() {
    await fs.writeFile(
      this.dataFilePath,
      JSON.stringify(this.availableSlots, null, 2)
    );
  }

  async saveBookings() {
    await fs.writeFile(
      this.bookingsFilePath,
      JSON.stringify(this.bookings, null, 2)
    );
  }

  async getAvailableSlots() {
    if (!this.initialized) await this.init();
    return this.availableSlots.filter((slot) => slot.available);
  }

  async getAvailableDates() {
    if (!this.initialized) await this.init();
    const availableSlots = this.availableSlots.filter((slot) => slot.available);

    // Group by date
    const dateMap = new Map();
    availableSlots.forEach((slot) => {
      if (!dateMap.has(slot.date)) {
        dateMap.set(slot.date, []);
      }
      dateMap.get(slot.date).push(slot.time);
    });

    // Convert to array of objects
    return Array.from(dateMap.entries()).map(([date, times]) => ({
      date,
      times,
    }));
  }

  async bookSlot(slotId, userDetails) {
    if (!this.initialized) await this.init();

    const slotIndex = this.availableSlots.findIndex(
      (slot) => slot.id === slotId
    );

    if (slotIndex === -1 || !this.availableSlots[slotIndex].available) {
      return { success: false, message: "This slot is no longer available" };
    }

    // Mark slot as unavailable
    this.availableSlots[slotIndex].available = false;

    // Create booking record
    const bookingId = `booking_${Date.now()}_${Math.floor(
      Math.random() * 1000
    )}`;
    const booking = {
      id: bookingId,
      slotId,
      date: this.availableSlots[slotIndex].date,
      time: this.availableSlots[slotIndex].time,
      userDetails,
      status: "pending_payment",
      createdAt: new Date().toISOString(),
    };

    this.bookings[bookingId] = booking;

    // Save changes
    await Promise.all([this.saveAvailableSlots(), this.saveBookings()]);

    return {
      success: true,
      booking,
    };
  }

  async confirmBooking(bookingId, paymentDetails) {
    if (!this.initialized) await this.init();

    if (!this.bookings[bookingId]) {
      return { success: false, message: "Booking not found" };
    }

    this.bookings[bookingId].status = "confirmed";
    this.bookings[bookingId].paymentDetails = paymentDetails;
    this.bookings[bookingId].confirmedAt = new Date().toISOString();

    await this.saveBookings();

    return {
      success: true,
      booking: this.bookings[bookingId],
    };
  }

  async cancelBooking(bookingId) {
    if (!this.initialized) await this.init();

    if (!this.bookings[bookingId]) {
      return { success: false, message: "Booking not found" };
    }

    const booking = this.bookings[bookingId];

    // If the booking was confirmed, make the slot available again
    if (
      booking.status === "confirmed" ||
      booking.status === "pending_payment"
    ) {
      const slotIndex = this.availableSlots.findIndex(
        (slot) => slot.id === booking.slotId
      );
      if (slotIndex !== -1) {
        this.availableSlots[slotIndex].available = true;
      }
      await this.saveAvailableSlots();
    }

    // Mark booking as cancelled
    this.bookings[bookingId].status = "cancelled";
    this.bookings[bookingId].cancelledAt = new Date().toISOString();

    await this.saveBookings();

    return {
      success: true,
      booking: this.bookings[bookingId],
    };
  }

  async getBookingsByUser(userNumber) {
    if (!this.initialized) await this.init();

    return Object.values(this.bookings).filter(
      (booking) => booking.userDetails.userNumber === userNumber
    );
  }
}

// Create and export a singleton instance
const bookingKB = new BookingKnowledgeBase();
export default bookingKB;
