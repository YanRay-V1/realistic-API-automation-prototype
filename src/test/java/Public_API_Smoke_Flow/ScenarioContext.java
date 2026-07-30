package Public_API_Smoke_Flow;


import java.util.HashMap;
import java.util.Map;

public class ScenarioContext {
    private String token;
    private Integer bookingId;

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public Integer getBookingId() { return bookingId; }
    public void setBookingId(Integer bookingId) { this.bookingId = bookingId; }

    // Feeds the placeholder resolver below
    public Map<String, String> asPlaceholderMap() {
        Map<String, String> map = new HashMap<>();
        if (token != null) map.put("token", token);
        if (bookingId != null) map.put("bookingId", String.valueOf(bookingId));
        return map;
    }
}