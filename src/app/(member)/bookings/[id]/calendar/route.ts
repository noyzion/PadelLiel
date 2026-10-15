import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildBookingIcs } from '@/lib/domain/calendar';
import { getAuthContext } from '@/server/auth';
import { getMyBookings } from '@/server/services/booking';

/**
 * "הוספה ליומן": an .ics file for one of the signed-in trainee's CONFIRMED bookings. The booking list comes from the
 * same database function as the bookings page, so a trainee can only ever export her own bookings.
 * No Google (or any) calendar login is involved; the file opens in the phone's calendar app.
 */
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new NextResponse('Not found', { status: 404 });

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse('Unauthorized', { status: 401 });
  if (ctx.profile.role !== 'trainee' || ctx.profile.approval_status !== 'approved') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const booking = (await getMyBookings(ctx.db)).find((b) => b.booking_id === id);
  if (!booking || booking.status !== 'CONFIRMED' || booking.session_status !== 'PUBLISHED') {
    return new NextResponse('Not found', { status: 404 });
  }

  const ics = buildBookingIcs({
    bookingId: booking.booking_id,
    sessionDate: booking.session_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
  });
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="padel-training-${booking.session_date}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
