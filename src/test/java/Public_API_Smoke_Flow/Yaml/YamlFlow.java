package Public_API_Smoke_Flow.Yaml;

import java.util.List;

public class YamlFlow {

    private String flowName;
    private List<YamlStep> steps;

    public List<YamlStep> getSteps() {
        return steps;
    }

    public void setSteps(List<YamlStep> steps) {
        this.steps = steps;
    }

    public String getFlowName() {
        return flowName;
    }

    public void setFlowName(String flowName) {
        this.flowName = flowName;
    }
}
