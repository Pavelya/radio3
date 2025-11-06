import FormatClockForm from '@/components/format-clock-form';

export default function NewFormatClockPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Format Clock</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <FormatClockForm mode="create" />
      </div>
    </div>
  );
}
