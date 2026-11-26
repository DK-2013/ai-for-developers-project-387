import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { meetingTypesQuery, slotsQuery } from "../api/queries";
import { BookingSlotsView } from "../components/booking-slots-view";
import { detailsHref, INVALID_START_MESSAGE, INVALID_START_NOTICE } from "../lib/booking-details";
import { detectBrowserTimeZone } from "../lib/slots";

type BookingPageProps = {
  guestTimeZone?: string;
};

export function BookingPage({ guestTimeZone = detectBrowserTimeZone() }: BookingPageProps = {}) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [activeDayKey, setActiveDayKey] = useState<string | undefined>();
  const meetingTypesResult = useQuery(meetingTypesQuery);
  const slotsResult = useQuery({
    ...slotsQuery(id ?? ""),
    enabled: id !== undefined,
  });

  const meetingType = meetingTypesResult.data?.meetingTypes.find((item) => item.id === id);
  const meetingTypeSummary =
    meetingType === undefined
      ? undefined
      : { name: meetingType.name, durationMinutes: meetingType.durationMinutes };
  const notice =
    searchParams.get("notice") === INVALID_START_NOTICE ? INVALID_START_MESSAGE : undefined;

  if (meetingTypesResult.isLoading || slotsResult.isLoading) {
    return <BookingSlotsView status="loading" meetingType={meetingTypeSummary} />;
  }

  if (meetingTypesResult.isError || slotsResult.isError) {
    return (
      <BookingSlotsView
        status="error"
        meetingType={meetingTypeSummary}
        message="Не удалось загрузить свободные слоты."
      />
    );
  }

  if (meetingType === undefined) {
    return <BookingSlotsView status="error" message="Тип встречи не найден." />;
  }

  const slotList = slotsResult.data;

  if (slotList === undefined || !("slots" in slotList)) {
    return (
      <BookingSlotsView
        status="error"
        meetingType={meetingTypeSummary}
        message="Не удалось загрузить свободные слоты."
      />
    );
  }

  return (
    <BookingSlotsView
      activeDayKey={activeDayKey}
      guestTimeZone={guestTimeZone}
      meetingType={meetingTypeSummary}
      notice={notice}
      onSelectDay={setActiveDayKey}
      slotHref={(slot) => detailsHref(`/book/${id ?? ""}`, slot)}
      slots={slotList.slots}
      status="ready"
      timezone={slotList.timezone}
      windowStart={slotList.windowStart}
      windowEnd={slotList.windowEnd}
    />
  );
}
