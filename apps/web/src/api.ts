const faMessages: Record<string, string> = {
  "Invalid input": "اطلاعات واردشده معتبر نیست.",
  "Permission denied": "شما به این بخش دسترسی ندارید.",
  "Authentication required": "ابتدا وارد حساب خود شوید.",
  "Session expired": "نشست شما پایان یافته است؛ دوباره وارد شوید.",
  "Invalid credentials": "ایمیل یا رمز عبور درست نیست.",
  "Record already exists": "این اطلاعات قبلاً ثبت شده است.",
  "Invalid related record": "ارتباط انتخاب‌شده معتبر نیست.",
  "Record not found": "اطلاعات موردنظر پیدا نشد.",
  "Invalid invitation": "کد دعوت معتبر نیست یا برای ایمیل شما صادر نشده است.",
  "Request failed": "انجام درخواست ممکن نشد؛ دوباره تلاش کنید.",
  "A manager cannot change their own role":
    "برای حفظ دسترسی مدیریت، تغییر نقش خودتان مجاز نیست.",
};
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const fa = (localStorage.getItem("crm_locale") ?? "fa") === "fa";
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      fa
        ? "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید."
        : "Unable to connect. Check your internet connection.",
    );
  }
  const result = await response.json();
  if (!response.ok) {
    const error = result.error ?? "Request failed";
    throw new Error(fa ? (faMessages[error] ?? error) : error);
  }
  return result;
}
