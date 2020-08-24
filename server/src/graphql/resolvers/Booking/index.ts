import { IResolvers } from "apollo-server-express";
import { Request } from "express";
import crypto from "crypto";

import { Stripe } from "../../../lib/api";
import { Database, Booking, BookingsIndex } from "../../../lib/types";
import { authorize } from "../../../lib/utils";
import { CreateBookingArgs } from "./types";

const resolveBookingsIndex = (
  bookingsIndex: BookingsIndex,
  checkInDate: string,
  checkOutDate: string
): BookingsIndex => {
  let dateCursor = new Date(checkInDate);
  let checkOut = new Date(checkOutDate);
  const newBookingsIndex: BookingsIndex = { ...bookingsIndex };

  checkOut.setFullYear(checkOut.getFullYear() - 200000);
  dateCursor.setFullYear(dateCursor.getFullYear() - 200000);

  while (dateCursor <= checkOut) {
    const y = dateCursor.getUTCFullYear();
    const m = dateCursor.getUTCMonth();
    const d = dateCursor.getUTCDate();

    if (!newBookingsIndex[y]) {
      newBookingsIndex[y] = {};
    }

    if (!newBookingsIndex[y][m]) {
      newBookingsIndex[y][m] = {};
    }

    if (!newBookingsIndex[y][m][d]) {
      newBookingsIndex[y][m][d] = true;
    } else {
      throw new Error(
        "Selected dates can't overlap dates that have already been booked"
      );
    }

    dateCursor = new Date(dateCursor.getTime() + 86400000);
    // dateCursor.setFullYear(dateCursor.getFullYear() - 200000);
    // console.log(
    //   "dateCursor in graphql/resolvers/Booking/index.ts: ",
    //   dateCursor
    // );
  }

  return newBookingsIndex;
};

export const bookingResolvers: IResolvers = {
  Mutation: {
    createBooking: async (
      _root: undefined,
      { input }: CreateBookingArgs,
      { db, req }: { db: Database; req: Request }
    ): Promise<Booking> => {
      try {
        const { id, source, checkIn, checkOut } = input;

        let viewer = await authorize(db, req);
        if (!viewer) {
          throw new Error("viewer cannot be found");
        }

        const listing = await db.listings.findOne({
          id,
        });
        if (!listing) {
          throw new Error("Listing can't be found");
        }

        if (listing.host === viewer.id) {
          throw new Error("User can't book own listing");
        }

        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);

        checkInDate.setFullYear(checkInDate.getFullYear() - 200000);
        checkOutDate.setFullYear(checkOutDate.getFullYear() - 200000);

        if (checkOutDate < checkInDate) {
          throw new Error("You can't check out before you check in");
        }

        const bookingsIndex = resolveBookingsIndex(
          listing.bookingsIndex,
          checkIn,
          checkOut
        );

        const totalPrice =
          listing.price *
          ((checkOutDate.getTime() - checkInDate.getTime()) / 86400000 + 1);

        const host = await db.users.findOne({
          id: listing.host,
        });

        if (!host || !host.walletId) {
          throw new Error(
            "The host either can't be found or is not connected with Stripe"
          );
        }

        await Stripe.charge(totalPrice, source, host.walletId);

        const newBooking: Booking = {
          id: crypto.randomBytes(16).toString("hex"),
          listing: listing.id,
          tenant: viewer.id,
          checkIn,
          checkOut,
        };

        const insertedBooking = await db.bookings.create(newBooking).save();

        host.income = host.income + totalPrice;
        await host.save();

        viewer.bookings.push(insertedBooking.id);
        await viewer.save();

        listing.bookingsIndex = bookingsIndex;
        listing.bookings.push(insertedBooking.id);
        await listing.save();

        // const insertRes = await db.bookings.insertOne({
        //   id: new ObjectId(),
        //   listing: listing.id,
        //   tenant: viewer.id,
        //   checkIn: checkIn.slice(0, 4) + checkIn.slice(6),
        //   checkOut: checkOut.slice(0, 4) + checkOut.slice(6),
        // });

        // const insertedBooking: Booking = insertRes.ops[0];

        // await db.users.updateOne(
        //   {
        //     id: host.id,
        //   },
        //   {
        //     $inc: { income: totalPrice },
        //   }
        // );

        // await db.users.updateOne(
        //   {
        //     id: viewer.id,
        //   },
        //   {
        //     $push: { bookings: insertedBooking.id },
        //   }
        // );

        // await db.listings.updateOne(
        //   {
        //     id: listing.id,
        //   },
        //   {
        //     $set: { bookingsIndex },
        //     $push: { bookings: insertedBooking.id },
        //   }
        // );

        return insertedBooking;
      } catch (error) {
        throw new Error(`Failed to create a booking: ${error}`);
      }
    },
  },
  Booking: {
    listing: (booking: Booking, _args: {}, { db }: { db: Database }) => {
      return db.listings.findOne({ id: booking.listing });
    },
    tenant: (booking: Booking, _args: {}, { db }: { db: Database }) => {
      return db.users.findOne({ id: booking.tenant });
    },
  },
};
