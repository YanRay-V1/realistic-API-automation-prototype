package Public_API_Smoke_Flow.Yaml;

import Public_API_Smoke_Flow.POJOs.BookingPayload;
import Public_API_Smoke_Flow.POJOs.TokenPayload;
import Public_API_Smoke_Flow.RequestMethods.*;
import Public_API_Smoke_Flow.ScenarioContext;

import java.util.HashMap;
import java.util.Map;

public class ActionRegistry {

    private final Map<String, YamlAction> actions = new HashMap<>();

    public ActionRegistry(ScenarioContext scenarioContext) {
        AuthSteps authSteps = new AuthSteps();
        BookingSteps bookingSteps = new BookingSteps();
        GetBookingInfoSteps getBookingInfoSteps = new GetBookingInfoSteps(scenarioContext);
        UpdateBookingSteps updateBookingSteps = new UpdateBookingSteps(scenarioContext);
        DeleteBookingSteps deleteBookingSteps = new DeleteBookingSteps(scenarioContext);
        GetBookingIds getBookingIds = new GetBookingIds();

        actions.put("createToken", ctx -> authSteps.createToken(ctx.getPayload(TokenPayload.class)));

        actions.put("createBooking", ctx -> bookingSteps.createBooking(ctx.getPayload(BookingPayload.class)));

        actions.put("getBookingInfo", ctx -> getBookingInfoSteps.getBookingInfo());

        actions.put("updateBooking", ctx -> updateBookingSteps.updateBooking(ctx.getPayload(BookingPayload.class)));

        actions.put("deleteBooking", ctx -> deleteBookingSteps.deleteBooking());

        actions.put("getBookingIds", ctx -> getBookingIds.retrieveIds());
    }

    public YamlAction get(String actionName) {
        YamlAction action = actions.get(actionName);
        if (action == null) {
            throw new IllegalArgumentException("Unknown YAML action'"+ actionName +"' Registered actions: " + actions.keySet());
        }
        return action;
    }
}
