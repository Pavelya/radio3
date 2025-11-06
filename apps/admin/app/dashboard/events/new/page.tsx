import EventForm from '@/components/event-form';

export default function NewEventPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Event</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <EventForm mode="create" />
      </div>
    </div>
  );
}
